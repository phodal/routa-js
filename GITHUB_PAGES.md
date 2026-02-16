# GitHub Pages Deployment

This repository is configured to automatically deploy documentation to GitHub Pages.

## Deployment Configuration

The deployment is handled by the GitHub Actions workflow `.github/workflows/deploy.yml`.

### What Gets Deployed

- Documentation landing page (`docs/index.html`)
- MCP Setup Guide (`docs/agent-mcp/MCP_SETUP_GUIDE.html`)
- MCP Implementation Guide (`docs/agent-mcp/MCP_IMPLEMENTATION.html`)

The markdown documentation files (`.md`) are automatically converted to HTML during the deployment process using the `convert-docs.js` script.

## Accessing the Documentation

Once deployed, the documentation will be available at:
- `https://phodal.github.io/routa-js/`

## Manual Deployment

You can manually trigger a deployment:
1. Go to the Actions tab in GitHub
2. Select the "Deploy to GitHub Pages" workflow
3. Click "Run workflow"

## GitHub Pages Settings

To enable GitHub Pages deployment, ensure the following settings are configured in your repository:

1. Go to repository **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The workflow will automatically deploy on push to `main` branch

## Local Preview

To preview the documentation locally:

```bash
# Convert markdown to HTML
node convert-docs.js

# Serve the docs folder with a local server
# Option 1: Using Python
cd docs && python3 -m http.server 8000

# Option 2: Using Node.js http-server
npx http-server docs -p 8000

# Option 3: Using PHP
cd docs && php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Adding New Documentation

To add new documentation:

1. Create your markdown file in `docs/` or `docs/agent-mcp/`
2. Update `convert-docs.js` to include your new file in the conversion list
3. Add a link to your document in `docs/index.html`
4. Commit and push your changes

The workflow will automatically convert and deploy the new documentation.
