#!/usr/bin/env node

import { getDatabase } from '../src/lib/database.js';
import { userRepository } from '../src/lib/repositories.js';

async function testDatabase() {
  try {
    // Initialize database
  await getDatabase();
    
    // Test creating a user
    const user = await userRepository.create({
      email: 'test@example.com',
      phone_e164: '+1234567890',
      country_origin: 'ABROAD'
    });
    
    console.log('Created user:', user);
    
    // Test finding user by phone
    const foundUser = await userRepository.findByPhone('+1234567890');
    console.log('Found user:', foundUser);
    
    // Test finding user by ID
    const foundUserById = await userRepository.findById(user.id);
    console.log('Found user by ID:', foundUserById);
    
    console.log('Database test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Database test failed:', error);
    process.exit(1);
  }
}

testDatabase();