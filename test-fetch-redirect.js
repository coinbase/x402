// Test if fetch with redirect: "follow" works with x402.org

async function testFetchRedirect() {
  console.log('Testing fetch with redirect: "follow"...');
  
  try {
    const response = await fetch('https://x402.org/facilitator/supported', {
      method: 'GET',
      redirect: 'follow',
    });
    
    console.log('Response status:', response.status);
    console.log('Response URL:', response.url);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Success! Response:', JSON.stringify(data, null, 2));
    } else {
      console.log('Failed with status:', response.status);
      const text = await response.text();
      console.log('Response body:', text);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFetchRedirect();