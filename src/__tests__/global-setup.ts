/**
 * Global Test Setup
 * Initializes testing environment
 */

export async function setup(): Promise<void> {
  console.log('🚀 Setting up global test environment...');
  
  // Set test environment variables (read-only in TypeScript, but works at runtime)
  (process.env as any).NODE_ENV = 'test';
  (process.env as any).NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
  
  // Initialize any global test state
  console.log('✅ Global test setup completed');
}

export default setup;