// Número de teléfono para mostrar impreso (la ficha PDF). Los números se
// guardan como dígitos con código de país (5491122334455, lo que pide wa.me);
// acá solo se agrupan para que se lean. Nunca se cambia ni se saca un dígito.
//
// Argentina: +54, el 9 de los celulares y 10 dígitos de número nacional
// (característica + abonado). Solo se separa la característica cuando es 11
// (AMBA): en el resto del país es de 3 o 4 dígitos según la localidad y hay
// de 4 que empiezan igual que una de 3 (230 Pilar / 2302 General Pico), así
// que sin la tabla completa el corte podría quedar mal — se deja junta.
// Cualquier otro país o formato: +<dígitos>, sin inventar agrupaciones.

const AR = /^54(9?)((?:11|[23]\d)\d{8})$/;

export function formatPhoneForDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const ar = AR.exec(digits);
  if (!ar) return `+${digits}`;
  const [, mobile, national] = ar;
  const prefix = mobile ? '+54 9' : '+54';
  if (national.startsWith('11')) return `${prefix} 11 ${national.slice(2, 6)}-${national.slice(6)}`;
  return `${prefix} ${national}`;
}
