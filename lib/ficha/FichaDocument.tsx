import { Document, Page, View, Text, Image as PdfImage, Link, StyleSheet } from '@react-pdf/renderer';
import type { FichaContent } from './content';

// Dibujo de la ficha PDF de una unidad (A4 vertical). El contenido ya viene
// decidido por buildFichaContent; acá solo hay diagramación.
// Spec: docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md

const INK = '#1c1a17';
const MUTED = '#5b6472';
const LINE = '#e4e2dc';

const s = StyleSheet.create({
  page: { paddingTop: 32, paddingHorizontal: 36, paddingBottom: 54, fontSize: 9.5, color: INK, fontFamily: 'Helvetica' },
  draft: { backgroundColor: '#fdf3d7', color: '#7a5a00', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingVertical: 5, marginBottom: 12, borderRadius: 3 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  headerLeft: { flex: 1, paddingRight: 12 },
  projectName: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  location: { fontSize: 9.5, color: MUTED, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  unitName: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  subtitle: { fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  hero: { width: '100%', height: 160, objectFit: 'cover', borderRadius: 4, marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 10 },
  specs: { flex: 1, paddingRight: 14 },
  sectionTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  spec: { fontSize: 9.5, paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: LINE },
  planBox: { flex: 1.2, height: 150, borderWidth: 0.5, borderColor: LINE, borderRadius: 4, padding: 6 },
  planImg: { width: '100%', height: '100%', objectFit: 'contain' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  priceLabel: { fontSize: 9.5, color: MUTED, marginRight: 8 },
  priceAmount: { fontSize: 18, fontFamily: 'Helvetica-Bold' },
  plan: { borderTopWidth: 0.5, borderTopColor: LINE, paddingVertical: 4 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between' },
  planName: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  planPrice: { fontSize: 9, color: MUTED },
  planLines: { fontSize: 9, marginTop: 2, lineHeight: 1.35 },
  planNote: { fontSize: 8, color: MUTED, marginTop: 1 },
  plansNote: { fontSize: 7.5, color: MUTED, marginTop: 4 },
  qrRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: LINE },
  qr: { width: 76, height: 76, marginRight: 12 },
  qrText: { flex: 1 },
  qrLead: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  link: { fontSize: 8.5, textDecoration: 'none' },
  contact: { fontSize: 9, marginTop: 5 },
  ask: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7.5, color: '#8a8f98', flexDirection: 'row', justifyContent: 'space-between' },
});

// La URL impresa se tipea a mano: nunca partirla con un guion.
const noHyphenation = (word: string) => [word];

export interface FichaDocumentProps {
  content: FichaContent;
  images: { hero: Buffer | null; plan: Buffer | null };
  qr: Buffer;
}

export function FichaDocument({ content: c, images, qr }: FichaDocumentProps) {
  return (
    <Document title={`Ficha ${c.unitName} — ${c.projectName}`} author={c.projectName}>
      <Page size="A4" style={s.page}>
        {c.draft && <Text style={s.draft}>Vista previa · proyecto sin publicar</Text>}

        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={[s.projectName, { color: c.accent }]}>{c.projectName}</Text>
            {!!c.location && <Text style={s.location}>{c.location}</Text>}
          </View>
          <View style={s.headerRight}>
            <Text style={s.unitName}>{c.unitName}</Text>
            {c.status && (
              <View style={s.statusRow}>
                <View style={[s.statusDot, { backgroundColor: c.status.color }]} />
                <Text style={s.statusText}>{c.status.label}</Text>
              </View>
            )}
          </View>
        </View>
        {c.subtitle && <Text style={s.subtitle}>{c.subtitle}</Text>}

        {images.hero && <PdfImage style={s.hero} src={{ data: images.hero, format: 'jpg' }} />}

        <View style={s.row} wrap={false}>
          <View style={s.specs}>
            <Text style={s.sectionTitle}>Datos</Text>
            {c.specs.map(line => <Text key={line} style={s.spec}>{line}</Text>)}
          </View>
          {images.plan && (
            <View style={s.planBox}>
              <PdfImage style={s.planImg} src={{ data: images.plan, format: 'jpg' }} />
            </View>
          )}
        </View>

        {c.price && (
          <View style={s.priceRow} wrap={false}>
            <Text style={s.priceLabel}>{c.price.label}</Text>
            <Text style={[s.priceAmount, { color: c.accent }]}>{c.price.amount}</Text>
          </View>
        )}

        {c.plans.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={s.sectionTitle}>Planes de pago</Text>
            {c.plans.map((p, i) => (
              <View key={i} style={s.plan} wrap={false}>
                <View style={s.planHead}>
                  <Text style={[s.planName, { color: c.accent }]}>{p.name}</Text>
                  {p.planPrice && <Text style={s.planPrice}>Precio con el plan {p.planPrice}</Text>}
                </View>
                <Text style={s.planLines}>{p.lines.join(' · ')}</Text>
                {p.indexNote && <Text style={s.planNote}>{p.indexNote}</Text>}
                {p.note && <Text style={s.planNote}>{p.note}</Text>}
              </View>
            ))}
            {c.plansNote && <Text style={s.plansNote}>{c.plansNote}</Text>}
          </View>
        )}

        <View style={s.qrRow} wrap={false}>
          <PdfImage style={s.qr} src={{ data: qr, format: 'png' }} />
          <View style={s.qrText}>
            {c.askPrice && <Text style={[s.ask, { color: c.accent }]}>Consultá el precio actual</Text>}
            <Text style={s.qrLead}>{c.qrLead}</Text>
            <Text hyphenationCallback={noHyphenation}><Link src={c.qrUrl} style={[s.link, { color: c.accent }]}>{c.qrUrl}</Link></Text>
            {c.whatsapp && (
              <Text style={s.contact}>
                WhatsApp <Link src={c.whatsapp.href} style={[s.link, { color: c.accent }]}>{c.whatsapp.label}</Link>
              </Text>
            )}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text style={{ flex: 1, paddingRight: 10 }}>Precios, disponibilidad y planes sujetos a cambios sin previo aviso. Imágenes ilustrativas.</Text>
          <Text>Ficha generada el {c.generatedOn}</Text>
        </View>
      </Page>
    </Document>
  );
}
