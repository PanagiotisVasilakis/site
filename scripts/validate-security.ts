#!/usr/bin/env tsx
/**
 * Security validation script
 * Performs comprehensive security checks before deployment
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

interface SecurityCheck {
  name: string;
  description: string;
  check: () => Promise<boolean> | boolean;
  severity: 'error' | 'warning' | 'info';
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
          const content = readFileSync(envFile, 'utf8');
          
          // Check if any values look like they contain actual secrets
          const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
          for (const line of lines) {
            const [key, value] = line.split('=');
            if (value && value.length > 20 && !value.includes('your-') && !value.includes('example')) {
              for (const pattern of dangerousPatterns) {
                if (pattern.test(key)) {
                  console.error(`⚠️ Potential secret exposure in ${envFile}: ${key}`);
                  return false;
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
        execSync('npm audit --audit-level=high --production', { stdio: 'pipe' });
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
        const nextConfig = readFileSync('next.config.ts', 'utf8');
        
        // Check for CSP header
        if (!nextConfig.includes('Content-Security-Policy')) {
          console.warn('⚠️ No Content Security Policy found in next.config.ts');
          return false;
        }

        // Check for unsafe CSP directives
        const unsafePatterns = [
          /'unsafe-inline'/,
          /'unsafe-eval'/,
          /\*\.*/,
          /data:/
        ];

        for (const pattern of unsafePatterns) {
          if (pattern.test(nextConfig)) {
            console.warn(`⚠️ Potentially unsafe CSP directive found: ${pattern.source}`);
          }
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
        const nextConfig = readFileSync('next.config.ts', 'utf8');
        
        // Check for HSTS header
        if (!nextConfig.includes('Strict-Transport-Security')) {
          console.error('⚠️ No HSTS (Strict-Transport-Security) header found');
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

      const gitignorePath = '.gitignore';
      let gitignoreContent = '';
      
      if (existsSync(gitignorePath)) {
        gitignoreContent = readFileSync(gitignorePath, 'utf8');
      }

      for (const secretFile of secretFiles) {
        if (existsSync(secretFile) && !gitignoreContent.includes(secretFile)) {
          console.error(`⚠️ Secret file ${secretFile} exists but not in .gitignore`);
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
        execSync('npm run build', { stdio: 'pipe' });
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
        
        const securityOptions = {
          strict: true,
          noImplicitAny: true,
          noImplicitReturns: true,
          noFallthroughCasesInSwitch: true,
          noUncheckedIndexedAccess: true
        };

        for (const [option, expectedValue] of Object.entries(securityOptions)) {
          if (tsconfig.compilerOptions?.[option] !== expectedValue) {
            console.warn(`⚠️ TypeScript option '${option}' should be ${expectedValue} for better security`);
          }
        }

        return true;
      } catch {
        console.warn('⚠️ Could not validate TypeScript configuration');
        return false;
      }
    }
  },
  {
    name: 'File Permissions',
    description: 'Check for overly permissive file permissions',
    severity: 'info',
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
              const result = execSync(`stat -c "%a" ${file}`, { encoding: 'utf8' }).trim();
              const permissions = parseInt(result, 8);
              
              // Check if file is world-writable (002 permission)
              if (permissions & 0o002) {
                console.warn(`⚠️ File ${file} is world-writable (${result})`);
              }
            } catch {
              // Ignore stat errors
            }
          }
        }

        return true;
      } catch {
        console.info('ℹ️ File permission check failed');
        return true; // Non-critical
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
    console.log('\n⚠️ Security validation passed with warnings.');
    console.log('Consider addressing the warnings above for better security.');
  } else {
    console.log('\n✅ All security checks passed!');
  }
}

// Run validation if script is executed directly
if (require.main === module) {
  runSecurityValidation().catch(() => {
    console.error('Security validation failed');
    process.exit(1);
  });
}

export { runSecurityValidation };