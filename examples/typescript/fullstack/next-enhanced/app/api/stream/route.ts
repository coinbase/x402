import { NextResponse } from 'next/server';

// Now, obviously, this could be impreoved really, when we have better schemes, like `upto`, I'm just exploring here fr, nothing serious, you can just do anything, ~unknown scientist
export async function GET() {
	try {
		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			async start(controller) {
				const messages = [
					'Connection established...\n',
					'Payment verified!\n',
					'Initializing data stream...\n',
					'\n',
					'Streaming data:\n',
					'==================================\n',
				];

				for (const msg of messages) {
					controller.enqueue(encoder.encode(msg));
					await new Promise((resolve) => setTimeout(resolve, 300));
				}

				for (let i = 1; i <= 10; i++) {
					const dataPoint = {
						id: i,
						timestamp: new Date().toISOString(),
						value: (Math.random() * 100).toFixed(2),
						status: 'active',
					};

					const line = `\n[${i}/10] ${JSON.stringify(dataPoint)}\n`;
					controller.enqueue(encoder.encode(line));
					await new Promise((resolve) => setTimeout(resolve, 500));
				}

				// Final messages
				controller.enqueue(
					encoder.encode('\n==================================\n')
				);
				controller.enqueue(encoder.encode('✅ Stream completed successfully!\n'));
				controller.enqueue(encoder.encode(`📝 Total items: 10\n`));
				controller.enqueue(
					encoder.encode(`⏱️  Duration: ${(10 * 0.5).toFixed(1)}s\n`)
				);

				controller.close();
			},
		});

		return new NextResponse(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Transfer-Encoding': 'chunked',
			},
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: 'Failed to stream' },
			{ status: 500 }
		);
	}
}
