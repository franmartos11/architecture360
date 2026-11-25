import { Document, Page, View, Text, Image as PdfImage, Link, StyleSheet } from '@react-pdf/renderer';
import type { FichaContent } from './content';
import { fichaHeaderLayout, HEADER_GAP } from './header';

// Dibujo de la ficha PDF de una unidad (A4 vertical). El contenido ya viene
// decidido por buildFichaContent; acá solo hay diagramación.
// Spec: docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md

const s = StyleSheet.create({
  page: { paddingTop: 24, paddingHorizontal: 36, paddingBottom: 44, fontSize: 9.5, fontFamily: 'Helvetica' },
  draft: { backgroundColor: '#fdf3d7', color: '#7a5a00', fontSize: 8.5, fontFamily: 'Helvetica-Bold', textAlign: 'center', paddingVertical: 4, marginBottom: 8, borderRadius: 3 },
  headerBand: { marginHorizontal: -36, marginTop: -24, paddingHorizontal: 36, paddingTop: 18, paddingBottom: 12, marginBottom: 10, borderBottomWidth: 2.5 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flex: 1, paddingRight: HEADER_GAP },
  // Tamaño y corte los decide fichaHeaderLayout; maxLines por si la medición se queda corta.
  projectName: { fontFamily: 'Helvetica-Bold', lineHeight: 1.15, maxLines: 2, textOverflow: 'ellipsis' },
  location: { fontSize: 9.5, marginTop: 2, maxLines: 2, textOverflow: 'ellipsis' },
  headerRight: { alignItems: 'flex-end', flexShrink: 0 },
  unitName: { fontFamily: 'Helvetica-Bold', textAlign: 'right', maxLines: 2, textOverflow: 'ellipsis' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusText: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 },
  subtitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1 },
  summary: { fontSize: 9, lineHeight: 1.35, marginBottom: 8 },
  progressPill: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, fontSize: 8, fontFamily: 'Helvetica-Bold' },
  hero: { width: '100%', height: 155, objectFit: 'cover', marginBottom: 10 },
  row: { flexDirection: 'row', marginBottom: 8, gap: 10 },
  specsCard: { flex: 1, borderWidth: 0.5, padding: 9 },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  spec: { fontSize: 9, paddingVertical: 2, borderBottomWidth: 0.5 },
  planBox: { flex: 1.15, height: 152, borderWidth: 0.5, padding: 6 },
  planImg: { width: '100%', height: '100%', objectFit: 'contain' },
  card: { marginTop: 7, borderWidth: 0.5, padding: 9 },
  inlineList: { fontSize: 8.5, lineHeight: 1.4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { fontSize: 8, borderWidth: 0.5, paddingHorizontal: 6, paddingVertical: 2 },
  roomsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roomItem: { width: '48%', paddingVertical: 2, borderBottomWidth: 0.5 },
  roomName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  roomMeta: { fontSize: 8 },
  galleryRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  galleryCard: { flex: 1 },
  galleryImg: { width: '100%', height: 78, objectFit: 'cover' },
  galleryCap: { fontSize: 7.5, marginTop: 2 },
  extraPlansRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  extraPlanCard: { flex: 1, borderWidth: 0.5, padding: 5 },
  extraPlanImg: { width: '100%', height: 95, objectFit: 'contain' },
  extraPlanCap: { fontSize: 7.5, textAlign: 'center', marginTop: 3 },
  academicRow: { flexDirection: 'row', paddingVertical: 1.5 },
  academicLabel: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', width: 85 },
  academicValue: { fontSize: 8.5, flex: 1 },
  priceCard: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderWidth: 0.5, borderLeftWidth: 3, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  priceLabel: { fontSize: 9.5 },
  priceAmount: { fontSize: 17, fontFamily: 'Helvetica-Bold' },
  plan: { borderTopWidth: 0.5, paddingVertical: 4 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between' },
  planName: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  planPrice: { fontSize: 8.5 },
  planLines: { fontSize: 8.5, marginTop: 2, lineHeight: 1.35 },
  planNote: { fontSize: 7.5, marginTop: 1 },
  plansNote: { fontSize: 7.5, marginTop: 4 },
  qrRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, borderWidth: 0.5, padding: 9 },
  qr: { width: 72, height: 72, marginRight: 12, backgroundColor: '#ffffff', padding: 2 },
  qrText: { flex: 1 },
  qrLead: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  link: { fontSize: 8.5, textDecoration: 'none' },
  contact: { fontSize: 9, marginTop: 4 },
  ask: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, paddingTop: 5, borderTopWidth: 0.5, fontSize: 7.5, flexDirection: 'row', justifyContent: 'space-between' },
});

// La URL impresa se tipea a mano: nunca partirla con un guion. Los títulos
// tampoco: fichaHeaderLayout mide cortando por palabras enteras.
const noHyphenation = (word: string) => [word];

export interface FichaDocumentProps {
  content: FichaContent;
  images: {
    hero: Buffer | null;
    plan: Buffer | null;
    gallery?: { data: Buffer; caption: string | null }[];
    extraPlans?: { data: Buffer; label: string }[];
  };
  qr: Buffer;
}

export function FichaDocument({ content: c, images, qr }: FichaDocumentProps) {
  const head = fichaHeaderLayout({ projectName: c.projectName, unitName: c.unitName, statusLabel: c.status?.label });
  const t = c.theme;
  const gallery = images.gallery ?? [];
  const extraPlans = images.extraPlans ?? [];
  return (
    <Document title={`Ficha ${c.unitName} — ${c.projectName}`} author={c.projectName}>
      <Page size="A4" style={[s.page, { backgroundColor: t.bg, color: t.text }]}>
        <View style={[s.headerBand, { backgroundColor: t.bgAlt, borderBottomColor: t.accent }]}>
          {c.draft && <Text style={s.draft}>Vista previa · proyecto sin publicar</Text>}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <Text hyphenationCallback={noHyphenation} style={[s.projectName, { color: t.textOnDark, fontSize: head.project.fontSize }]}>{head.project.text}</Text>
              {!!c.location && <Text style={[s.location, { color: t.textOnDarkMuted }]}>{c.location}</Text>}
            </View>
            <View style={[s.headerRight, { width: head.rightWidth }]}>
              <Text hyphenationCallback={noHyphenation} style={[s.unitName, { color: t.textOnDark, fontSize: head.unit.fontSize }]}>{head.unit.text}</Text>
              {c.status && (
                <View style={s.statusRow}>
                  <View style={[s.statusDot, { backgroundColor: c.status.color }]} />
                  <Text style={[s.statusText, { color: t.textOnDark }]}>{c.status.label}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {(c.subtitle || c.progress) && (
          <View style={s.metaRow}>
            {c.subtitle ? <Text style={[s.subtitle, { color: t.accent }]}>{c.subtitle}</Text> : <View />}
            {c.progress && (
              <Text style={[s.progressPill, { backgroundColor: t.bgAccent, color: t.textOnDark, borderRadius: t.radiusSm }]}>
                {c.progress}
              </Text>
            )}
          </View>
        )}
        {c.projectSummary && <Text style={[s.summary, { color: t.textMuted }]}>{c.projectSummary}</Text>}

        {images.hero && <PdfImage style={[s.hero, { borderRadius: t.radius }]} src={{ data: images.hero, format: 'jpg' }} />}

        <View style={s.row} wrap={false}>
          <View style={[s.specsCard, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Datos</Text>
            {c.specs.map(line => <Text key={line} style={[s.spec, { borderBottomColor: t.border }]}>{line}</Text>)}
          </View>
          {images.plan && (
            <View style={[s.planBox, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
              <PdfImage style={s.planImg} src={{ data: images.plan, format: 'jpg' }} />
            </View>
          )}
        </View>

        {c.features.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Comodidades</Text>
            <View style={s.chipRow}>
              {c.features.map((f, i) => (
                <Text key={i} style={[s.chip, { backgroundColor: t.bg, borderColor: t.border, borderRadius: t.radiusSm }]}>{f}</Text>
              ))}
            </View>
          </View>
        )}

        {c.rooms.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Ambientes</Text>
            <View style={s.roomsGrid}>
              {c.rooms.map((r, i) => (
                <View key={i} style={[s.roomItem, { borderBottomColor: t.border }]}>
                  <Text style={s.roomName}>{r.name}{r.area ? ` (${r.area})` : ''}</Text>
                  {r.features && <Text style={[s.roomMeta, { color: t.textMuted }]}>{r.features}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {extraPlans.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Otras plantas</Text>
            <View style={s.extraPlansRow}>
              {extraPlans.map((ep, i) => (
                <View key={i} style={[s.extraPlanCard, { backgroundColor: t.bg, borderColor: t.border, borderRadius: t.radiusSm }]}>
                  <PdfImage style={s.extraPlanImg} src={{ data: ep.data, format: 'jpg' }} />
                  <Text style={[s.extraPlanCap, { color: t.textMuted }]}>{ep.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {gallery.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Galería y vistas</Text>
            <View style={s.galleryRow}>
              {gallery.map((g, i) => (
                <View key={i} style={s.galleryCard}>
                  <PdfImage style={[s.galleryImg, { borderRadius: t.radiusSm }]} src={{ data: g.data, format: 'jpg' }} />
                  {g.caption && <Text style={[s.galleryCap, { color: t.textMuted }]}>{g.caption}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {c.price && (
          <View style={[s.priceCard, { backgroundColor: t.surface, borderColor: t.border, borderLeftColor: t.accent, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.priceLabel, { color: t.textMuted }]}>{c.price.label}</Text>
            <Text style={[s.priceAmount, { color: t.accent }]}>{c.price.amount}</Text>
          </View>
        )}

        {c.plans.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Planes de pago</Text>
            {c.plans.map((p, i) => (
              <View key={i} style={[s.plan, { borderTopColor: t.border }]} wrap={false}>
                <View style={s.planHead}>
                  <Text style={[s.planName, { color: t.accent }]}>{p.name}</Text>
                  {p.planPrice && <Text style={[s.planPrice, { color: t.textMuted }]}>Precio con el plan {p.planPrice}</Text>}
                </View>
                <Text style={s.planLines}>{p.lines.join(' · ')}</Text>
                {p.indexNote && <Text style={[s.planNote, { color: t.textMuted }]}>{p.indexNote}</Text>}
                {p.note && <Text style={[s.planNote, { color: t.textMuted }]}>{p.note}</Text>}
              </View>
            ))}
            {c.plansNote && <Text style={[s.plansNote, { color: t.textMuted }]}>{c.plansNote}</Text>}
          </View>
        )}

        {c.amenities.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Amenities</Text>
            <View style={s.chipRow}>
              {c.amenities.map((a, i) => (
                <Text key={i} style={[s.chip, { backgroundColor: t.bg, borderColor: t.border, borderRadius: t.radiusSm }]}>{a}</Text>
              ))}
            </View>
          </View>
        )}

        {(c.nearby.length > 0 || c.mapUrl) && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Entorno y ubicación</Text>
            {c.nearby.length > 0 && <Text style={s.inlineList}>{c.nearby.join(' · ')}</Text>}
            {c.mapUrl && (
              <Text style={{ marginTop: c.nearby.length > 0 ? 3 : 0 }}>
                <Link src={c.mapUrl} style={[s.link, { color: t.accent }]}>Ver ubicación en Google Maps</Link>
              </Text>
            )}
          </View>
        )}

        {c.academic.length > 0 && (
          <View style={[s.card, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
            <Text style={[s.sectionTitle, { color: t.textMuted }]}>Ficha del proyecto</Text>
            {c.academic.map((row, i) => (
              <View key={i} style={s.academicRow}>
                <Text style={[s.academicLabel, { color: t.textMuted }]}>{row.label}</Text>
                <Text style={s.academicValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={[s.qrRow, { backgroundColor: t.surface, borderColor: t.border, borderRadius: t.radius }]} wrap={false}>
          <PdfImage style={[s.qr, { borderRadius: t.radiusSm }]} src={{ data: qr, format: 'png' }} />
          <View style={s.qrText}>
            {c.askPrice && <Text style={[s.ask, { color: t.accent }]}>Consultá el precio actual</Text>}
            <Text style={s.qrLead}>{c.qrLead}</Text>
            <Text hyphenationCallback={noHyphenation}><Link src={c.qrUrl} style={[s.link, { color: t.accent }]}>{c.qrUrl}</Link></Text>
            {c.whatsapp && (
              <Text style={s.contact}>
                WhatsApp <Link src={c.whatsapp.href} style={[s.link, { color: t.accent }]}>{c.whatsapp.label}</Link>
              </Text>
            )}
          </View>
        </View>

        <View style={[s.footer, { borderTopColor: t.border, color: t.textMuted }]} fixed>
          <Text style={{ flex: 1, paddingRight: 10 }}>Precios, disponibilidad y planes sujetos a cambios sin previo aviso. Imágenes ilustrativas.</Text>
          <Text>Ficha generada el {c.generatedOn}</Text>
        </View>
      </Page>
    </Document>
  );
}
