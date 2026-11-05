import { redirect } from 'next/navigation';

// Ubicación y Amenidades ahora son una sola pantalla: el capítulo Entorno.
export default function RedirectToEntorno() {
  redirect('/admin/proyecto/entorno');
}
