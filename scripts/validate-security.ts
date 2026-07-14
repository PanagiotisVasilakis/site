#!/usr/bin/env tsx
/**
 * Security validation script
 * Performs comprehensive security checks before deployment
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { execFileSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';

interface SecurityCheck {
  name: string;
  description: string;
  check: () => Promise<boolean> | boolean;
  severity: 'error' | 'warning' | 'info';
}

function gitCommandSucceeds(args: string[]): boolean {
  try {
    execFileSync('git', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isGitTracked(file: string): boolean {
  return gitCommandSucceeds(['ls-files', '--error-unmatch', '--', file]);
}

function isGitIgnored(file: string): boolean {
  return gitCommandSucceeds(['check-ignore', '-q', '--', file]);
}

const checks: SecurityCheck[] = [
  {
    name: 'Environment Variables',
    description: 'Check for exposed secrets in environment variables',
    severity: 'error',
    check: () => {
      const envFiles = ['.env', '.env.local', '.env.production'];
      const dangerousPatterns = [
        /password/i,
        /secret/i,
        /key/i,
        /token/i,
        /api_key/i,
        /private/i
      ];

      for (const envFile of envFiles) {
        if (existsSync(envFile)) {
          const tracked = isGitTracked(envFile);
          const ignored = isGitIgnored(envFile);
          const content = readFileSync(envFile, 'utf8');
          
          // Check if any values look like they contain actual secrets
          const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
          for (const line of lines) {
            const [key, value] = line.split('=');
            if (value && value.length > 20 && !value.includes('your-') && !value.includes('example')) {
              for (const pattern of dangerousPatterns) {
                if (pattern.test(key)) {
                  if (tracked || !ignored) {
                    console.error(`⚠️ Potential secret exposure in ${envFile}: ${key}`);
                    return false;
                  }
                }
              }
            }
          }
        }
      }
      return true;
    }
  },
  {
    name: 'Package Vulnerabilities',
    description: 'Check for known vulnerabilities in dependencies',
    severity: 'error',
    check: async () => {
      try {
        execSync('npm audit --audit-level=high --omit=dev', { stdio: 'pipe' });
        return true;
      } catch {
        console.error('⚠️ High/Critical vulnerabilities found in dependencies');
        return false;
      }
    }
  },
  {
    name: 'CSP Configuration',
    description: 'Validate Content Security Policy configuration',
    severity: 'warning',
    check: () => {
      try {
        const securitySources = [
          existsSync('src/lib/security-config.ts') ? readFileSync('src/lib/security-config.ts', 'utf8') : '',
          existsSync('src/lib/security-middleware-edge.ts') ? readFileSync('src/lib/security-middleware-edge.ts', 'utf8') : '',
          existsSync('next.config.ts') ? readFileSync('next.config.ts', 'utf8') : '',
        ].join('\n');
        
        // Check for CSP header
        if (!securitySources.includes('Content-Security-Policy') && !securitySources.includes('buildCSPDirective')) {
          console.warn('⚠️ No Content Security Policy implementation found');
          return false;
        }

        return true;
      } catch {
        console.warn('⚠️ Could not validate CSP configuration');
        return false;
      }
    }
  },
  {
    name: 'HTTPS Configuration',
    description: 'Check for HTTPS enforcement',
    severity: 'error',
    check: () => {
      try {
        const securitySources = [
          existsSync('src/lib/security-config.ts') ? readFileSync('src/lib/security-config.ts', 'utf8') : '',
          existsSync('src/lib/security-middleware-edge.ts') ? readFileSync('src/lib/security-middleware-edge.ts', 'utf8') : '',
        ].join('\n');
        
        // Check for HSTS header
        if (!securitySources.includes('Strict-Transport-Security')) {
          console.error('⚠️ No HSTS (Strict-Transport-Security) implementation found');
          return false;
        }

        return true;
      } catch {
        console.error('⚠️ Could not validate HTTPS configuration');
        return false;
      }
    }
  },
  {
    name: 'Secret Files',
    description: 'Check for accidentally committed secret files',
    severity: 'error',
    check: () => {
      const secretFiles = [
        '.env.production',
        '.env.local',
        'private.key',
        'id_rsa',
        'id_dsa',
        'config.json',
        'secrets.json'
      ];

      for (const secretFile of secretFiles) {
        if (!existsSync(secretFile)) continue;
        if (isGitTracked(secretFile)) {
          console.error(`⚠️ Secret file ${secretFile} is tracked by git`);
          return false;
        }
        if (!isGitIgnored(secretFile)) {
          console.error(`⚠️ Secret file ${secretFile} exists but is not ignored by git`);
          return false;
        }
      }

      return true;
    }
  },
  {
    name: 'Production Build',
    description: 'Verify production build completes successfully',
    severity: 'error',
    check: async () => {
      try {
        console.log('Building application...');
        execSync('npm run build', { stdio: 'inherit' });
        return true;
      } catch {
        console.error('⚠️ Production build failed');
        return false;
      }
    }
  },
  {
    name: 'TypeScript Security',
    description: 'Check TypeScript configuration for security',
    severity: 'warning',
    check: () => {
      try {
        const tsconfig = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
        
        let valid = true;
        if (tsconfig.compilerOptions?.strict !== true) {
          console.warn("⚠️ TypeScript option 'strict' should be true for better security");
          valid = false;
        }

        const noImplicitAny = tsconfig.compilerOptions?.noImplicitAny ?? tsconfig.compilerOptions?.strict;
        if (noImplicitAny !== true) {
          console.warn("⚠️ TypeScript option 'noImplicitAny' should be true for better security");
          valid = false;
        }

        return valid;
      } catch {
        console.warn('⚠️ Could not validate TypeScript configuration');
        return false;
      }
    }
  },
  {
    name: 'File Permissions',
    description: 'Check for overly permissive file permissions',
    severity: 'error',
    check: () => {
      try {
        // Check if we're on a Unix-like system
        if (process.platform === 'win32') {
          console.info('ℹ️ File permission check skipped on Windows');
          return true;
        }

        const sensitiveFiles = ['package.json', 'next.config.ts', 'tsconfig.json'];
        
        for (const file of sensitiveFiles) {
          if (existsSync(file)) {
            try {
              const permissions = statSync(file).mode & 0o777;
              
              // Check if file is world-writable (002 permission)
              if (permissions & 0o002) {
                console.warn(`⚠️ File ${file} is world-writable (${permissions.toString(8)})`);
                return false;
              }
            } catch {
              // Ignore stat errors
            }
          }
        }

        return true;
      } catch {
        console.error('⚠️ File permission check failed');
        return false;
      }
    }
  }
];

async function runSecurityValidation(): Promise<void> {
  console.log('🔒 Running security validation...\n');

  let errorCount = 0;
  let warningCount = 0;

  for (const check of checks) {
    console.log(`Checking: ${check.name}`);
    console.log(`  ${check.description}`);

    try {
      const result = await check.check();
      
      if (result) {
        console.log(`  ✅ Passed\n`);
      } else {
        if (check.severity === 'error') {
          console.log(`  ❌ Failed (Error)\n`);
          errorCount++;
        } else if (check.severity === 'warning') {
          console.log(`  ⚠️ Failed (Warning)\n`);
          warningCount++;
        } else {
          console.log(`  ℹ️ Info\n`);
        }
      }
    } catch (error) {
      console.log(`  💥 Error running check: ${error}\n`);
      if (check.severity === 'error') {
        errorCount++;
      }
    }
  }

  console.log('🔒 Security validation complete!');
  console.log(`Results: ${errorCount} errors, ${warningCount} warnings`);

  if (errorCount > 0) {
    console.log('\n❌ Security validation failed!');
    console.log('Please fix the errors above before deploying to production.');
    process.exit(1);
  } else if (warningCount > 0) {
    console.log('\n❌ Security validation failed because warnings are treated as unresolved findings.');
    process.exit(1);
  } else {
    console.log('\n✅ All security checks passed!');
  }
}

// Run validation if script is executed directly
const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;

if (isMain) {
  runSecurityValidation().catch(() => {
    console.error('Security validation failed');
    process.exit(1);
  });
}

export { runSecurityValidation };
