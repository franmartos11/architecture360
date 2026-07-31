import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

function getDb() {
  const file = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(file);
}

function saveDb(data: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET() {
  try {
    const db = getDb();
    return NextResponse.json(db.calculatorSettings || { interestRate: 5, maxYears: 30, minDownPayment: 20 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    
    // Update only allowed settings
    db.calculatorSettings = {
      ...db.calculatorSettings,
      interestRate: Number(body.interestRate),
      maxYears: Number(body.maxYears),
      minDownPayment: Number(body.minDownPayment)
    };
    
    saveDb(db);
    return NextResponse.json({ success: true, settings: db.calculatorSettings });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
