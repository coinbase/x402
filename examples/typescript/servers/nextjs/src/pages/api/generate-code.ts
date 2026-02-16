import { createPaymentHandler } from '@x402/next';
import type { NextApiRequest, NextApiResponse } from 'next';

interface CodeRequest {
  language: string;
  description: string;
  complexity?: 'simple' | 'medium' | 'complex';
}

// Mock code generation based on request
function generateCode(request: CodeRequest): string {
  const { language, description, complexity = 'simple' } = request;
  
  const templates = {
    simple: `// Simple ${language} implementation\nfunction solve() {\n    // ${description}\n    return "Hello World";\n}`,
    medium: `// ${language} implementation\nclass Solution {\n    solve() {\n        // ${description}\n        // TODO: Implement logic\n        return result;\n    }\n}`,
    complex: `// Advanced ${language} implementation\nclass ${description.replace(/\s+/g, '')}Solution {\n    constructor() {\n        this.cache = new Map();\n    }\n    \n    async solve() {\n        // ${description}\n        // Complex implementation with caching\n        return await this.processRequest();\n    }\n    \n    private async processRequest() {\n        // Implementation details...\n    }\n}`
  };
  
  return templates[complexity] || templates.simple;
}

const handler = createPaymentHandler({
  // Dynamic pricing based on complexity
  accepts: (req) => {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const complexity = body?.complexity || 'simple';
    
    const pricing = {
      simple: '$0.02',
      medium: '$0.05', 
      complex: '$0.10'
    };
    
    return [
      {
        scheme: 'exact',
        network: 'eip155:8453', // Base
        price: pricing[complexity as keyof typeof pricing],
        payTo: '0x1234567890123456789012345678901234567890',
        extra: {
          assetTransferMethod: 'eip3009'
        }
      }
    ];
  },
  description: 'Generate code snippets with dynamic pricing based on complexity'
}, async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const request: CodeRequest = typeof req.body === 'string' 
      ? JSON.parse(req.body) 
      : req.body;
      
    if (!request.language || !request.description) {
      return res.status(400).json({
        error: 'Missing required fields: language, description'
      });
    }

    const code = generateCode(request);
    
    res.status(200).json({
      success: true,
      data: {
        language: request.language,
        description: request.description,
        complexity: request.complexity || 'simple',
        code,
        generated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(400).json({
      error: 'Invalid JSON in request body'
    });
  }
});

export default handler;