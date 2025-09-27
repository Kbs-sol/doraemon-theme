# Deployment Guide - Doraemon Movies Website

## 🚀 Cloudflare Pages Deployment

### Prerequisites
1. **Cloudflare API Key**: Set up via the Deploy tab
2. **GitHub Repository**: Already configured at https://github.com/Kbs-sol/doraemon-theme

### Step-by-Step Deployment

#### 1. Configure Cloudflare Authentication
```bash
# This will be available after API key setup
setup_cloudflare_api_key
```

#### 2. Create Production D1 Database
```bash
# Create the production database
npx wrangler d1 create doraemon-production

# Copy the database ID from output and update wrangler.jsonc
# Replace "replace-with-actual-id-after-creation" with the real ID
```

#### 3. Update Wrangler Configuration
Edit `wrangler.jsonc`:
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "doraemon-production",
      "database_id": "YOUR_ACTUAL_DATABASE_ID_HERE"
    }
  ]
}
```

#### 4. Apply Database Migrations to Production
```bash
# Apply migrations to production database
npx wrangler d1 migrations apply doraemon-production

# Optionally seed with sample data
npx wrangler d1 execute doraemon-production --file=./seed.sql
```

#### 5. Create Cloudflare Pages Project
```bash
# Create the Pages project
npx wrangler pages project create doraemon-movies \
  --production-branch main \
  --compatibility-date 2024-01-01
```

#### 6. Deploy to Production
```bash
# Build the project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name doraemon-movies
```

### Expected URLs After Deployment
- **Production**: https://doraemon-movies.pages.dev
- **Branch**: https://main.doraemon-movies.pages.dev

## 🔧 Environment Configuration

### Required Secrets (Optional)
If you plan to use automated content generation:

```bash
# Add API keys as secrets
npx wrangler pages secret put API_KEY_SEARCH --project-name doraemon-movies
npx wrangler pages secret put SEARCH_ENGINE_ID --project-name doraemon-movies
npx wrangler pages secret put AI_API_KEY --project-name doraemon-movies
```

### AdSense Configuration
Update the AdSense publisher ID in the HTML templates:
- Replace `ca-pub-XXXXXXXXXXXXXXXX` with your actual AdSense publisher ID
- This can be done via the admin panel or by editing the source code

## 📊 Post-Deployment Verification

### 1. Test Core Functionality
```bash
# Test homepage
curl https://doraemon-movies.pages.dev

# Test API endpoints
curl https://doraemon-movies.pages.dev/api/movies

# Test blog functionality
curl https://doraemon-movies.pages.dev/api/blog/doraemon-steel-troops-2011-review
```

### 2. Verify Database Connection
- Visit the admin panel: `/admin`
- Check that movie data is loaded
- Verify analytics tracking is working

### 3. SEO & Performance
- Test mobile responsiveness
- Verify meta tags are properly rendered
- Check page load speeds
- Confirm AdSense ads are displaying (after approval)

## 🔄 Continuous Deployment

### GitHub Actions (Future Enhancement)
The repository is set up for manual deployment. To enable automatic deployment:

1. **Connect GitHub to Cloudflare Pages**:
   - Go to Cloudflare Dashboard → Pages
   - Connect your GitHub repository
   - Set build command: `npm run build`
   - Set output directory: `dist`

2. **Environment Variables**:
   - Add any required secrets in Cloudflare Pages settings
   - Configure build environment if needed

## 🛠️ Maintenance Commands

### Database Management
```bash
# View production database
npx wrangler d1 execute doraemon-production --command="SELECT * FROM movies LIMIT 5"

# Backup database (future enhancement)
npx wrangler d1 export doraemon-production --output=backup.sql

# Apply new migrations
npx wrangler d1 migrations apply doraemon-production
```

### Content Management
```bash
# Generate new content (when API keys are configured)
curl -X POST https://doraemon-movies.pages.dev/api/admin/generate-content

# Monitor logs
npx wrangler pages deployment tail --project-name doraemon-movies
```

## 🔍 Troubleshooting

### Common Issues
1. **Database Connection Errors**: Verify D1 database ID in wrangler.jsonc
2. **Build Failures**: Check TypeScript errors and dependency versions
3. **AdSense Issues**: Ensure publisher ID is correct and site is approved
4. **CORS Errors**: Verify API endpoints are properly configured

### Debug Commands
```bash
# Check wrangler configuration
npx wrangler whoami

# Test local development
npm run dev:sandbox

# View deployment logs
npx wrangler pages deployment list --project-name doraemon-movies
```

## 📈 Performance Optimization

### After Deployment
1. **Enable Cloudflare Caching**: Configure page rules for static assets
2. **Image Optimization**: Use Cloudflare Images for movie posters
3. **CDN Configuration**: Optimize cache headers for better performance
4. **Analytics Setup**: Connect Google Analytics for detailed insights

### Monitoring
- Set up Cloudflare Analytics for traffic insights
- Monitor D1 database usage and performance
- Track AdSense revenue and optimization opportunities

## 🎯 Production Checklist

Before going live:
- [ ] Cloudflare API key configured
- [ ] Production database created and migrated
- [ ] AdSense publisher ID updated
- [ ] All API endpoints tested
- [ ] Mobile responsiveness verified
- [ ] SEO meta tags confirmed
- [ ] Content policies compliance checked
- [ ] Backup strategy implemented

---

**Status**: Ready for deployment once Cloudflare API key is configured.
**Repository**: https://github.com/Kbs-sol/doraemon-theme
**Meta Project Name**: doraemon-movies (saved in meta_info)