const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testHealth() {
  try {
    const response = await axios.get(`${BASE_URL}/api/test/health`);
    console.log('Health check:', response.data);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}

async function testEmailServiceType() {
  try {
    const response = await axios.get(`${BASE_URL}/api/test/email-service-type`);
    console.log('Email service type:', response.data);
  } catch (error) {
    console.error('Email service type check failed:', error.message);
  }
}

async function testSeedEmails() {
  try {
    const testEmails = [
      {
        id: 'test-email-1',
        from: 'supplier@example.com',
        subject: 'Test Price List',
        receivedAt: new Date().toISOString(),
        attachments: [
          {
            fileName: 'test-prices.csv',
            contentType: 'text/csv',
            content: Buffer.from('Product,SKU,Price\nWidget A,WA001,19.99\nWidget B,WB002,29.99').toString('base64'),
            size: 100
          }
        ]
      }
    ];

    const response = await axios.post(`${BASE_URL}/api/test/seed-test-emails`, testEmails);
    console.log('Seed emails result:', response.data);
  } catch (error) {
    console.error('Seed emails failed:', error.message);
  }
}

async function runTests() {
  console.log('Running basic tests...\n');
  
  await testHealth();
  await testEmailServiceType();
  await testSeedEmails();
  
  console.log('\nTests completed!');
}

runTests().catch(console.error);
