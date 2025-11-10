import { NextResponse } from 'next/server';

export async function GET() {
	try {
		const randomNumber = Math.floor(Math.random() * 1000000);
		const timestamp = new Date().toISOString();

		return NextResponse.json({
			success: true,
			data: {
				number: randomNumber,
				timestamp,
				range: '0-999999',
			},
			message: 'Random number generated successfully',
		});
	} catch (error) {
		return NextResponse.json(
			{ success: false, error: 'Failed to generate random number' },
			{ status: 500 }
		);
	}
}
