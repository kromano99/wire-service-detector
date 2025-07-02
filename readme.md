
// README-DEPLOYMENT.md
# Wire Service Detector - Deployment Guide

## 🚀 Quick Deploy Options

### Option 1: Railway (Recommended - Free with generous limits)
1. Fork this repo or create new repo with these files
2. Go to [railway.app](https://railway.app)
3. Connect your GitHub repo
4. Deploy automatically
5. Get your live URL

### Option 2: Render (Free tier available)
1. Go to [render.com](https://render.com)
2. Connect your GitHub repo
3. Create new Web Service
4. Use these settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Deploy

### Option 3: Vercel (May have limitations with Puppeteer)
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repo
3. Deploy with zero config

### Option 4: Docker/Self-hosted
```bash
docker build -t wire-detector .
docker run -p 3000:3000 wire-detector
```

## 🔧 Environment Variables (Optional)
- `NODE_ENV=production` (automatically set on most platforms)
- `PORT` (automatically set by hosting platform)

## 📊 Resource Requirements
- **Memory**: 512MB minimum, 1GB recommended
- **CPU**: 1 vCPU sufficient
- **Storage**: Minimal (< 100MB)

## 🎯 Deployment Features
- Optimized for cloud hosting
- Automatic browser management
- Rate limiting built-in
- Health check endpoint
- Graceful shutdown
- Error handling
- Production logging

## 🧪 Test Your Deployment
1. Visit your deployed URL
2. Test with a few news sites
3. Verify evidence links work
4. Check performance

## 💡 Tips
- Railway offers the best free tier for this app
- Render works well but may be slower
- Vercel may have Puppeteer limitations
- For heavy usage, consider self-hosting

Ready to deploy in under 5 minutes! 🚀
