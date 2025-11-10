import { NextResponse } from 'next/server';

const quotes = [
	{
		text: 'The only way to do great work is to love what you do.',
		author: 'Steve Jobs',
	},
	{
		text: 'Innovation distinguishes between a leader and a follower.',
		author: 'Steve Jobs',
	},
	{
		text: 'Life is 10% what happens to you and 90% how you react to it.',
		author: 'Charles R. Swindoll',
	},
	{
		text:
			'The best time to plant a tree was 20 years ago. The second best time is now.',
		author: 'Chinese Proverb',
	},
	{
		text: "Your time is limited, don't waste it living someone else's life.",
		author: 'Steve Jobs',
	},
	{
		text: "Whether you think you can or you think you can't, you're right.",
		author: 'Henry Ford',
	},
	{
		text:
			'The future belongs to those who believe in the beauty of their dreams.',
		author: 'Eleanor Roosevelt',
	},
	{
		text:
			'Success is not final, failure is not fatal: it is the courage to continue that counts.',
		author: 'Winston Churchill',
	},
];

export async function GET() {
	try {
		const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

		return NextResponse.json({
			success: true,
			data: randomQuote,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: 'Failed to quotes from wise ones :)' },
			{ status: 500 }
		);
	}
}
