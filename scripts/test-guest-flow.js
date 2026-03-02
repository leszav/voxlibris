#!/usr/bin/env node

// Integration test for guest flow
// Usage: node scripts/test-guest-flow.js

const API_BASE = 'http://localhost:3000/api/v1/guest';

async function testGuestFlow() {
  console.log('🧪 Testing Guest Flow Integration...');
  
  try {
    // Test 1: Init guest
    console.log('\n1️⃣ Testing guest init...');
    const initResponse = await fetch(`${API_BASE}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint: 'test-fingerprint-' + Date.now()
      })
    });
    
    if (!initResponse.ok) {
      throw new Error(`Init failed: ${initResponse.status} ${await initResponse.text()}`);
    }
    
    const guest = await initResponse.json();
    console.log('✅ Guest created:', {
      guestId: guest.guestId,
      accessCode: guest.accessCode,
      hasBook: guest.hasBook
    });
    
    // Extract cookie for subsequent requests
    const cookies = initResponse.headers.get('set-cookie');
    const guestCookie = cookies?.split(';')[0] || '';
    
    // Test 2: Get guest profile
    console.log('\n2️⃣ Testing guest profile...');
    const profileResponse = await fetch(`${API_BASE}/me`, {
      headers: { 'Cookie': guestCookie }
    });
    
    if (!profileResponse.ok) {
      throw new Error(`Profile failed: ${profileResponse.status}`);
    }
    
    const profile = await profileResponse.json();
    console.log('✅ Profile retrieved:', {
      guestId: profile.guestId,
      expiresAt: profile.expiresAt
    });
    
    // Test 3: Test restore by code
    console.log('\n3️⃣ Testing restore by code...');
    const restoreResponse = await fetch(`${API_BASE}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: guest.accessCode,
        fingerprint: 'different-fingerprint-' + Date.now()
      })
    });
    
    if (!restoreResponse.ok) {
      throw new Error(`Restore failed: ${restoreResponse.status}`);
    }
    
    console.log('✅ Restore by code successful');
    
    // Test 4: Analytics summary
    console.log('\n4️⃣ Testing analytics...');
    const analyticsResponse = await fetch(`${API_BASE}/analytics/summary`, {
      headers: { 'Cookie': guestCookie }
    });
    
    if (!analyticsResponse.ok) {
      throw new Error(`Analytics failed: ${analyticsResponse.status}`);
    }
    
    const analytics = await analyticsResponse.json();
    console.log('✅ Analytics retrieved:', {
      totalReadingTime: analytics.totalReadingTime,
      sessionsCount: analytics.sessionsCount
    });
    
    console.log('\n🎉 All tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testGuestFlow();
