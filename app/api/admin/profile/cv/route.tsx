import { NextResponse } from 'next/server';
import { renderToBuffer, Document, Page, View, Text, Link, StyleSheet } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/slug';
import { getAvailabilityInfo } from '@/lib/profile-availability';
import type { ProfileRow } from '@/types/database';

// GET /api/admin/profile/cv — arma un PDF con los datos del portfolio de la
// cuenta logueada (nombre, titular, aptitudes, experiencia, educación,
// certificados, premios y proyectos visibles). Se genera al vuelo en cada
// pedido en vez de guardarse: es exactamente lo que hay cargado ahora en
// /admin/portfolio, sin un archivo desactualizado dando vueltas.
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: '#1c1a17', fontFamily: 'Helvetica' },
  name: { fontSize: 22, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  headline: { fontSize: 12, color: '#3f5a3c', marginBottom: 6 },
  metaRow: { flexDirection: 'row', fontSize: 9, color: '#555', marginBottom: 14 },
  metaSep: { marginHorizontal: 6, color: '#bbb' },
  bio: { fontSize: 10, lineHeight: 1.5, marginBottom: 16, color: '#333' },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', letterSpacing: 1, color: '#555', marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  tag: { fontSize: 9, backgroundColor: '#f0efe9', color: '#444', paddingVertical: 3, paddingHorizontal: 7, borderRadius: 3, marginRight: 5, marginBottom: 5 },
  item: { marginBottom: 9 },
  itemTitleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  itemDates: { fontSize: 9, color: '#777' },
  itemSubtitle: { fontSize: 9.5, color: '#555', marginTop: 1 },
  itemNote: { fontSize: 9, color: '#555', marginTop: 3, lineHeight: 1.4 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8.5, color: '#999', textAlign: 'center' },
  footerLink: { color: '#4a6647' },
});

interface CvProps {
  profile: ProfileRow;
  projectNames: string[];
  siteUrl: string;
}

function CvDocument({ profile, projectNames, siteUrl }: CvProps) {
  const isCompany = profile.account_type === 'company';
  const availability = getAvailabilityInfo(profile.availability);
  const meta = [profile.location, profile.license ? `Mat. ${profile.license}` : null, availability.label].filter(Boolean) as string[];

  return (
    <Document title={`CV — ${profile.display_name}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{profile.display_name}</Text>
        {profile.headline && <Text style={styles.headline}>{profile.headline}</Text>}
        {meta.length > 0 && (
          <View style={styles.metaRow}>
            {meta.map((m, i) => (
              <Text key={i}>{i > 0 && <Text style={styles.metaSep}>·</Text>}{m}</Text>
            ))}
          </View>
        )}
        {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

        {(profile.specialties.length > 0 || profile.languages.length > 0) && (
          <>
            <Text style={styles.sectionTitle}>Especialidades e idiomas</Text>
            {profile.specialties.length > 0 && (
              <View style={styles.tagsRow}>{profile.specialties.map(s => <Text key={s} style={styles.tag}>{s}</Text>)}</View>
            )}
            {profile.languages.length > 0 && (
              <View style={styles.tagsRow}>{profile.languages.map(l => <Text key={l} style={styles.tag}>{l}</Text>)}</View>
            )}
          </>
        )}

        {profile.skills.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Aptitudes</Text>
            <View style={styles.tagsRow}>
              {profile.skills.slice().sort((a, b) => b.level - a.level).map(sk => (
                <Text key={sk.label} style={styles.tag}>{sk.label} {'●'.repeat(sk.level)}{'○'.repeat(3 - sk.level)}</Text>
              ))}
            </View>
          </>
        )}

        {!isCompany && profile.experiences.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Experiencia</Text>
            {profile.experiences.map((exp, i) => (
              <View key={i} style={styles.item}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemTitle}>{exp.role}</Text>
                  <Text style={styles.itemDates}>{exp.startYear} – {exp.endYear || 'Presente'}</Text>
                </View>
                <Text style={styles.itemSubtitle}>{exp.company}</Text>
                {exp.description && <Text style={styles.itemNote}>{exp.description}</Text>}
              </View>
            ))}
          </>
        )}

        {!isCompany && profile.education.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Educación</Text>
            {profile.education.map((edu, i) => (
              <View key={i} style={styles.item}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemTitle}>{edu.career || edu.institution}</Text>
                  <Text style={styles.itemDates}>{edu.startYear}{edu.startYear ? ` – ${edu.endYear || 'En curso'}` : ''}</Text>
                </View>
                {edu.career && <Text style={styles.itemSubtitle}>{edu.institution}</Text>}
              </View>
            ))}
          </>
        )}

        {!isCompany && profile.certifications.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Certificados</Text>
            {profile.certifications.map((cert, i) => (
              <View key={i} style={styles.item}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemTitle}>{cert.name}</Text>
                  <Text style={styles.itemDates}>{cert.year}</Text>
                </View>
                <Text style={styles.itemSubtitle}>{cert.issuer}</Text>
              </View>
            ))}
          </>
        )}

        {!isCompany && profile.awards.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Premios y publicaciones</Text>
            {profile.awards.map((award, i) => (
              <View key={i} style={styles.item}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemTitle}>{award.name}</Text>
                  {award.year && <Text style={styles.itemDates}>{award.year}</Text>}
                </View>
                {award.issuer && <Text style={styles.itemSubtitle}>{award.issuer}</Text>}
              </View>
            ))}
          </>
        )}

        {projectNames.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Proyectos</Text>
            <Text style={{ fontSize: 9.5, color: '#444', lineHeight: 1.5 }}>{projectNames.join(' · ')}</Text>
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>Portfolio completo en <Link src={`${siteUrl}/portfolio/${profile.handle}`} style={styles.footerLink}>{siteUrl.replace(/^https?:\/\//, '')}/portfolio/{profile.handle}</Link></Text>
        </View>
      </Page>
    </Document>
  );
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Creá tu portfolio antes de generar un CV.' }, { status: 400 });

  const { data: projectRows } = await supabase
    .from('projects')
    .select('name')
    .eq('owner_id', user.id)
    .eq('show_in_portfolio', true)
    .eq('published', true)
    .order('created_at', { ascending: false });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const buffer = await renderToBuffer(
    <CvDocument profile={profile as ProfileRow} projectNames={(projectRows ?? []).map(p => p.name)} siteUrl={siteUrl} />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${slugify(profile.display_name || 'cv')}-cv.pdf"`,
    },
  });
}
