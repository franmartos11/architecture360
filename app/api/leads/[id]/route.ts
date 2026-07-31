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

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const body = await request.json();
    
    const db = getDb();
    const leadIndex = (db.leads || []).findIndex((l: any) => l.id === id);
    
    if (leadIndex === -1) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (body.status !== undefined) {
      db.leads[leadIndex].status = body.status;
    }

    saveDb(db);
    return NextResponse.json(db.leads[leadIndex]);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
  }
}
