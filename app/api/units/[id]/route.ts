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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const body = await request.json();
    
    const db = getDb();
    const unitIndex = db.units.findIndex((u: any) => u.id === id);
    
    if (unitIndex === -1) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    // Update only allowed fields
    const unit = db.units[unitIndex];
    if (body.status !== undefined) unit.status = body.status;
    if (body.price !== undefined) unit.price = body.price;

    saveDb(db);
    return NextResponse.json(unit);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 });
  }
}
