# Bundle Analyzer Package
npm install --save-dev webpack-bundle-analyzer

# For analyzing the bundle size after building
npm run build
npx webpack-bundle-analyzer build/static/js/*.js

# Alternative: Use source-map-explorer (lighter weight)
npm install --save-dev source-map-explorer

# Add to package.json scripts:
# "analyze": "npm run build && npx source-map-explorer 'build/static/js/*.js'"

# Performance Analysis Commands:
# 1. Check bundle size: npm run analyze
# 2. Lighthouse audit: Use Chrome DevTools > Lighthouse
# 3. React DevTools Profiler: Install React Developer Tools extension
