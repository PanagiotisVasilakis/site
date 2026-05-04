/**
 * API Documentation Portal
 * Interactive Swagger UI for API documentation
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Documentation</title>
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css" />
    <link rel="icon" type="image/png" href="/favicon.ico" />
    <style>
        :root {
            --title-font: Georgia, "Times New Roman", serif;
        }
        html {
            box-sizing: border-box;
            overflow: -moz-scrollbars-vertical;
            overflow-y: scroll;
        }
        *, *:before, *:after {
            box-sizing: inherit;
        }
        body {
            margin: 0;
            background: #fafafa;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        h1, h2, h3,
        .swagger-ui .info .title,
        .swagger-ui .opblock-tag,
        .swagger-ui .opblock-summary-path {
            font-family: var(--title-font);
        }
        .swagger-ui .topbar {
            background-color: #1976d2;
        }
        .swagger-ui .topbar .download-url-wrapper {
            display: none;
        }
        .custom-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
            margin-bottom: 0;
        }
        .custom-header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 300;
        }
        .custom-header p {
            margin: 0.5rem 0 0 0;
            opacity: 0.9;
            font-size: 1.1rem;
        }
        .api-info {
            background: white;
            padding: 1.5rem;
            margin: 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .api-info h2 {
            margin: 0 0 1rem 0;
            color: #333;
            font-size: 1.5rem;
        }
        .api-info .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
            margin-top: 1rem;
        }
        .info-card {
            background: #f8f9fa;
            padding: 1rem;
            border-radius: 8px;
            border-left: 4px solid #1976d2;
        }
        .info-card h3 {
            margin: 0 0 0.5rem 0;
            color: #1976d2;
            font-size: 1.1rem;
        }
        .info-card p {
            margin: 0;
            color: #666;
            line-height: 1.5;
        }
        .security-note {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem 0;
        }
        .security-note strong {
            color: #856404;
        }
        #swagger-ui {
            max-width: 1200px;
            margin: 0 auto;
        }
    </style>
</head>
<body>
    <div class="custom-header">
        <h1>API Documentation</h1>
        <p>Comprehensive API reference for developers</p>
    </div>
    
    <div class="api-info">
        <h2>Getting Started</h2>
        <div class="info-grid">
            <div class="info-card">
                <h3>Base URL</h3>
                <p><code>https://yourdomain.com/api</code></p>
                <p>All API endpoints are relative to this base URL.</p>
            </div>
            
            <div class="info-card">
                <h3>Authentication</h3>
                <p>Most endpoints are public. Admin endpoints require JWT authentication via cookies.</p>
            </div>
            
            <div class="info-card">
                <h3>Rate Limiting</h3>
                <p>APIs are rate-limited to prevent abuse. Standard limits apply per IP address.</p>
            </div>
            
            <div class="info-card">
                <h3>Response Format</h3>
                <p>All responses are in JSON format with appropriate HTTP status codes.</p>
            </div>
        </div>
        
        <div class="security-note">
            <strong>Security Note:</strong> All API requests are logged and monitored. 
            Malicious requests (SQL injection, XSS attempts) will be blocked and reported.
        </div>
    </div>

    <div id="swagger-ui"></div>
    
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            // Build a system
            const ui = SwaggerUIBundle({
                url: '/api/docs/openapi',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                tryItOutEnabled: true,
                requestInterceptor: function(request) {
                    // Add any custom headers or authentication
                    console.log('API Request:', request.method, request.url);
                    return request;
                },
                responseInterceptor: function(response) {
                    console.log('API Response:', response.status, response.url);
                    return response;
                },
                onComplete: function() {
                    console.log('API Documentation loaded successfully');
                },
                supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
                validatorUrl: null, // Disable validator badge
                docExpansion: 'list',
                filter: true,
                showRequestHeaders: true,
                showCommonExtensions: true,
                defaultModelsExpandDepth: 2,
                defaultModelExpandDepth: 2
            });
            
            // Custom styling and functionality
            setTimeout(() => {
                // Hide the Swagger logo
                const logo = document.querySelector('.topbar-wrapper img');
                if (logo) {
                    logo.style.display = 'none';
                }
                
                // Add custom logo or title
                const topbar = document.querySelector('.topbar-wrapper .link');
                if (topbar) {
                    topbar.innerHTML = '<h3 style="color: white; margin: 0;">Site API Documentation</h3>';
                }
            }, 1000);
        };
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Press 'f' to focus search
            if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
                const searchInput = document.querySelector('.operation-filter-input');
                if (searchInput && document.activeElement !== searchInput) {
                    e.preventDefault();
                    searchInput.focus();
                }
            }
            
            // Press 'Escape' to clear search
            if (e.key === 'Escape') {
                const searchInput = document.querySelector('.operation-filter-input');
                if (searchInput && searchInput.value) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                }
            }
        });
        
        // Add copy functionality for code examples
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('copy-to-clipboard')) {
                const code = e.target.nextElementSibling;
                if (code) {
                    navigator.clipboard.writeText(code.textContent);
                    e.target.textContent = 'Copied!';
                    setTimeout(() => {
                        e.target.textContent = 'Copy';
                    }, 2000);
                }
            }
        });
    </script>
</body>
</html>
  `.trim();

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
