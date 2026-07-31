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
    return NextResponse.json(db.leads || []);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    
    if (!db.leads) db.leads = [];
    
    const newLead = {
      id: Date.now().toString(),
      ...body,
      status: 'nuevo',
      createdAt: new Date().toISOString()
    };
    
    db.leads.push(newLead);
    saveDb(db);
    
    return NextResponse.json({ success: true, lead: newLead });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
