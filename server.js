const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced middleware for deployment
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.vercel.app', 'https://your-domain.netlify.app']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced rate limiting for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Wire service configurations
const WIRE_SERVICES = {
  'Associated Press': {
    patterns: [
      /\b(Associated Press|AP|A\.P\.)\b/gi,
      /\bThe Associated Press\b/gi
    ],
    metaPatterns: [/associated.?press/gi, /\bap\b/gi]
  },
  'Reuters': {
    patterns: [/\bReuters\b/gi, /\bREUTERS\b/g],
    metaPatterns: [/reuters/gi]
  },
  'Bloomberg': {
    patterns: [
      /\bBloomberg\b/gi,
      /\bBloomberg News\b/gi,
      /\bBloomberg LP\b/gi
    ],
    metaPatterns: [/bloomberg/gi]
  },
  'Agence France-Presse': {
    patterns: [
      /\bAFP\b/g,
      /\bAgence France-Presse\b/gi,
      /\bA\.F\.P\.\b/g
    ],
    metaPatterns: [/afp/gi, /agence.france.presse/gi]
  },
  'Press Association': {
    patterns: [
      /\bPress Association\b/gi,
      /\bPA\b/g,
      /\bP\.A\.\b/g
    ],
    metaPatterns: [/press.association/gi]
  },
  'Deutsche Presse-Agentur': {
    patterns: [
      /\bDPA\b/g,
      /\bdpa\b/g,
      /\bDeutsche Presse-Agentur\b/gi
    ],
    metaPatterns: [/dpa/gi, /deutsche.presse/gi]
  },
  'Xinhua': {
    patterns: [
      /\bXinhua\b/gi,
      /\bXinhua News Agency\b/gi
    ],
    metaPatterns: [/xinhua/gi]
  },
  'TASS': {
    patterns: [
      /\bTASS\b/g,
      /\bRussian News Agency TASS\b/gi
    ],
    metaPatterns: [/tass/gi]
  },
  'The Conversation': {
    patterns: [/\bThe Conversation\b/gi],
    metaPatterns: [/theconversation/gi, /the.conversation/gi]
  },
  'Stacker': {
    patterns: [
      /\bStacker\b/gi,
      /\bStacker Newswire\b/gi
    ],
    metaPatterns: [/stacker/gi]
  }
};

class DeployableWireServiceDetector {
  constructor() {
    this.browser = null;
    this.minArticles = 8; // Reduced for faster deployment performance
    this.maxArticles = 15; // Reduced for faster deployment performance
  }

  async initBrowser() {
    if (!this.browser) {
      const isProduction = process.env.NODE_ENV === 'production';
      
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-features=VizDisplayCompositor',
          ...(isProduction ? [
            '--memory-pressure-off',
            '--max_old_space_size=4096'
          ] : [])
        ],
        timeout: 30000
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async findArticleLinks(url, progressCallback) {
    const domain = new URL(url).hostname;
    const page = await (await this.initBrowser()).newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      progressCallback && progressCallback(`🔍 Discovering articles on ${domain}...`);
      
      await page.goto(url, { 
        waitUntil: 'networkidle0', 
        timeout: 20000 
      });
      
      const articleLinks = await page.evaluate((domain) => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        const articleUrls = new Set();
        
        const articleSelectors = [
          'a[href*="/article/"]',
          'a[href*="/story/"]',
          'a[href*="/news/"]',
          'a[href*="/post/"]',
          'a[href*="/2024/"]',
          'a[href*="/2025/"]',
          'article a',
          '.article-link',
          '.story-link',
          'h1 a', 'h2 a', 'h3 a'
        ];
        
        links.forEach(link => {
          const href = link.getAttribute('href');
          if (!href) return;
          
          let fullUrl;
          try {
            if (href.startsWith('http')) {
              fullUrl = href;
            } else if (href.startsWith('/')) {
              fullUrl = `https://${domain}${href}`;
            } else {
              return;
            }
            
            const linkUrl = new URL(fullUrl);
            
            if (linkUrl.hostname === domain) {
              const path = linkUrl.pathname.toLowerCase();
              if (path.includes('/article/') || 
                  path.includes('/story/') || 
                  path.includes('/news/') ||
                  path.includes('/post/') ||
                  /\/\d{4}\//.test(path) ||
                  link.closest('article') ||
                  link.textContent.trim().length > 20) {
                articleUrls.add(fullUrl);
              }
            }
          } catch (e) {
            // Skip invalid URLs
          }
        });
        
        return Array.from(articleUrls);
      }, domain);
      
      // Remove duplicates and limit for deployment performance
      const uniqueLinks = [...new Set(articleLinks)];
      return uniqueLinks.slice(0, this.maxArticles);
      
    } catch (error) {
      progressCallback && progressCallback(`⚠️ Error finding articles: ${error.message}`);
      return [];
    } finally {
      await page.close();
    }
  }

  async analyzeArticle(url) {
    const page = await (await this.initBrowser()).newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 15000 
      });

      const pageData = await page.evaluate(() => {
        const getTextContent = (selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => el.textContent.trim()).filter(text => text.length > 0);
        };

        const getMetaContent = (selector) => {
          const elements = document.querySelectorAll(selector);
          return Array.from(elements).map(el => el.getAttribute('content') || el.getAttribute('value') || '').filter(content => content.length > 0);
        };

        return {
          title: document.title || '',
          bodyText: document.body ? document.body.innerText.substring(0, 5000) : '', // Limit for performance
          bylineElements: [
            ...getTextContent('[class*="byline" i]'),
            ...getTextContent('[class*="author" i]'),
            ...getTextContent('[class*="writer" i]'),
            ...getTextContent('[class*="reporter" i]'),
            ...getTextContent('.byline, .author, .writer, .reporter')
          ],
          metaTags: [
            ...getMetaContent('meta[name="author"]'),
            ...getMetaContent('meta[property="article:author"]'),
            ...getMetaContent('meta[name="twitter:creator"]')
          ],
          firstParagraphs: Array.from(document.querySelectorAll('p')).slice(0, 5).map(p => p.textContent.trim()).filter(text => text.length > 20)
        };
      });

      return this.detectWireServicesInArticle(pageData, url);
      
    } catch (error) {
      return {
        error: error.message,
        wireServices: [],
        bylineText: [],
        detectionMethods: []
      };
    } finally {
      await page.close();
    }
  }

  detectWireServicesInArticle(pageData, url) {
    const detectedServices = new Set();
    const bylineTexts = new Set();
    const methods = new Set();

    // Method 1: Byline Elements
    for (const bylineText of pageData.bylineElements) {
      for (const [serviceName, config] of Object.entries(WIRE_SERVICES)) {
        for (const pattern of config.patterns) {
          if (pattern.test(bylineText)) {
            detectedServices.add(serviceName);
            bylineTexts.add(bylineText);
            methods.add('byline-elements');
            break;
          }
        }
      }
    }

    // Method 2: Meta Tags
    for (const metaContent of pageData.metaTags) {
      for (const [serviceName, config] of Object.entries(WIRE_SERVICES)) {
        for (const pattern of config.metaPatterns) {
          if (pattern.test(metaContent)) {
            detectedServices.add(serviceName);
            bylineTexts.add(metaContent);
            methods.add('meta-tags');
            break;
          }
        }
      }
    }

    // Method 3: Content Patterns
    const contentToSearch = [pageData.title, ...pageData.firstParagraphs].join(' ');
    const byPatterns = [
      /By\s+[^,]+,\s*([^.]+)/g,
      /\([A-Z]+\)\s*[-–—]/g,
      /([A-Z]+)\s*\|/g
    ];

    for (const pattern of byPatterns) {
      let match;
      while ((match = pattern.exec(contentToSearch)) !== null) {
        const potentialService = match[1] ? match[1].trim() : match[0].trim();
        
        for (const [serviceName, config] of Object.entries(WIRE_SERVICES)) {
          for (const servicePattern of config.patterns) {
            if (servicePattern.test(potentialService)) {
              detectedServices.add(serviceName);
              bylineTexts.add(match[0].trim());
              methods.add('content-patterns');
              break;
            }
          }
        }
      }
    }

    // Method 4: URL Patterns
    for (const [serviceName, config] of Object.entries(WIRE_SERVICES)) {
      for (const pattern of config.metaPatterns) {
        if (pattern.test(url)) {
          detectedServices.add(serviceName);
          methods.add('url-patterns');
          break;
        }
      }
    }

    return {
      wireServices: Array.from(detectedServices),
      bylineText: Array.from(bylineTexts),
      detectionMethods: Array.from(methods),
      error: null
    };
  }

  async analyzeSite(inputUrl, progressCallback) {
    const startTime = Date.now();
    const result = {
      inputUrl: inputUrl,
      domain: '',
      wireServices: [],
      confidence: 0,
      articlesAnalyzed: 0,
      articlesWithWireServices: 0,
      detectionSummary: {},
      sampleBylines: [],
      processingTime: '',
      error: null,
      articleResults: []
    };

    try {
      const domain = new URL(inputUrl).hostname;
      result.domain = domain;

      progressCallback && progressCallback(`🚀 Starting analysis of ${domain}...`);

      const articleLinks = await this.findArticleLinks(inputUrl, progressCallback);
      
      if (articleLinks.length === 0) {
        result.error = 'No articles found on this site';
        return result;
      }

      result.articlesAnalyzed = Math.min(articleLinks.length, this.maxArticles);
      progressCallback && progressCallback(`📊 Found ${articleLinks.length} articles, analyzing ${result.articlesAnalyzed}...`);

      const wireServiceCounts = {};
      const allBylines = [];
      const allMethods = new Set();
      const articleResults = [];

      for (let i = 0; i < Math.min(articleLinks.length, this.maxArticles); i++) {
        const articleUrl = articleLinks[i];
        progressCallback && progressCallback(`📄 Analyzing article ${i + 1}/${result.articlesAnalyzed}: ${new URL(articleUrl).pathname.substring(0, 30)}...`);
        
        try {
          const articleResult = await this.analyzeArticle(articleUrl);
          articleResults.push({
            url: articleUrl,
            ...articleResult
          });

          for (const service of articleResult.wireServices) {
            wireServiceCounts[service] = (wireServiceCounts[service] || 0) + 1;
          }

          allBylines.push(...articleResult.bylineText);
          articleResult.detectionMethods.forEach(method => allMethods.add(method));

          await new Promise(resolve => setTimeout(resolve, 1000)); // Deployment-friendly delay
        } catch (error) {
          articleResults.push({
            url: articleUrl,
            error: error.message,
            wireServices: [],
            bylineText: [],
            detectionMethods: []
          });
        }
      }

      result.articleResults = articleResults;

      const totalArticles = articleResults.length;
      const articlesWithServices = articleResults.filter(a => a.wireServices && a.wireServices.length > 0).length;
      
      result.articlesWithWireServices = articlesWithServices;

      const consistentServices = [];
      const detectionThreshold = Math.max(2, Math.floor(totalArticles * 0.15));

      for (const [service, count] of Object.entries(wireServiceCounts)) {
        if (count >= detectionThreshold) {
          consistentServices.push(service);
          
          const evidenceArticles = articleResults
            .filter(article => article.wireServices && article.wireServices.includes(service))
            .slice(0, 3)
            .map(article => ({
              url: article.url,
              bylineText: article.bylineText.filter(byline => {
                for (const pattern of WIRE_SERVICES[service].patterns) {
                  if (pattern.test(byline)) return true;
                }
                return false;
              }),
              detectionMethods: article.detectionMethods
            }));
          
          result.detectionSummary[service] = {
            articlesFound: count,
            percentage: Math.round((count / totalArticles) * 100),
            evidenceArticles: evidenceArticles
          };
        }
      }

      result.wireServices = consistentServices;
      result.sampleBylines = [...new Set(allBylines)].slice(0, 5);

      let confidence = 0;
      
      if (consistentServices.length > 0) {
        const maxPercentage = Math.max(...Object.values(result.detectionSummary).map(s => s.percentage));
        confidence += Math.min(60, maxPercentage);
        
        if (allMethods.size > 1) confidence += 20;
        if (consistentServices.length > 1) confidence += 10;
        if (totalArticles >= this.minArticles) confidence += 10;
      }

      result.confidence = Math.min(100, confidence);

    } catch (error) {
      result.error = error.message;
    }

    result.processingTime = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
    return result;
  }

  async analyzeSites(inputUrls, progressCallback) {
    const results = [];
    
    for (let i = 0; i < inputUrls.length; i++) {
      const url = inputUrls[i].trim();
      if (!url) continue;

      try {
        progressCallback && progressCallback(`🌐 Processing site ${i + 1}/${inputUrls.length}: ${new URL(url).hostname}`);
        const result = await this.analyzeSite(url, progressCallback);
        results.push(result);
        
        if (i < inputUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        results.push({
          inputUrl: url,
          domain: new URL(url).hostname,
          wireServices: [],
          confidence: 0,
          articlesAnalyzed: 0,
          articlesWithWireServices: 0,
          detectionSummary: {},
          sampleBylines: [],
          processingTime: '0s',
          error: error.message,
          articleResults: []
        });
      }
    }

    return results;
  }
}

const detector = new DeployableWireServiceDetector();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Main analysis endpoint with SSE
app.post('/api/analyze', async (req, res) => {
  try {
    const { urls } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of URLs' });
    }

    if (urls.length > 5) { // Reduced for deployment
      return res.status(400).json({ error: 'Maximum 5 sites allowed per request' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const sendProgress = (message) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`);
    };

    try {
      const results = await detector.analyzeSites(urls, sendProgress);
      
      const summary = {
        totalSites: results.length,
        sitesWithWireServices: results.filter(r => r.wireServices.length > 0).length,
        totalArticlesAnalyzed: results.reduce((sum, r) => sum + r.articlesAnalyzed, 0),
        averageConfidence: results.length > 0 ? 
          Math.round(results.reduce((sum, r) => sum + r.confidence, 0) / results.length) : 0
      };

      res.write(`data: ${JSON.stringify({ 
        type: 'complete', 
        results: results,
        summary: summary
      })}\n\n`);
      
    } catch (error) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error.message 
      })}\n\n`);
    }

    res.end();
    
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Internal server error during analysis' });
  }
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  await detector.closeBrowser();
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await detector.closeBrowser();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await detector.closeBrowser();
  process.exit(1);
});

app.listen(PORT, () => {
  console.log(`🚀 Wire Service Detector deployed on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
