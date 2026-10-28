// Apariciones al scrollear (ver components/ui/Reveal.tsx), resueltas por un
// script chico que corre apenas se parsea el HTML — antes de que hidrate
// React. Reemplaza al whileInView de framer-motion, que tenía tres fallas
// medidas:
// - el HTML salía con opacity:0 inline: sin JS (o hasta que hidrataba, ~1,5 s
//   en un celular lento) 16 bloques de la portada no se veían;
// - solo revelaba lo que estaba en pantalla EN ESE MOMENTO: al scrollear
//   rápido sobre una sección pesada (el visor BIM) el aviso llegaba tarde,
//   el bloque ya había salido por arriba y quedaba invisible;
// - animaba también lo que ya estaba en pantalla al cargar.
//
// Reglas:
// - Sin JS no se oculta nada: el CSS solo oculta bajo html.js (REVEAL_BOOT).
// - Lo que está en pantalla o ya quedó arriba cuando se lo ve por primera
//   vez aparece sin animación (data-revealed="instant").
// - Lo que entra desde abajo al scrollear se anima (data-revealed="anim").
// - Los bloques que llegan después (streaming, navegación del cliente) los
//   toma un MutationObserver.
// - Un bloque sin caja (0×0) todavía no está colocado: con streaming, Next
//   manda el contenido a un contenedor oculto y después lo mueve a su lugar.
//   Se espera — al moverlo, el MutationObserver lo evalúa con su posición
//   real. (Tomarlo como "en pantalla" o "pasado" lo mostraba sin animación.)

/** Va primero en el <body>: marca que hay JS antes de pintar nada. */
export const REVEAL_BOOT = `document.documentElement.classList.add('js')`;

/** Va al final del <body>. */
export const REVEAL_SCRIPT = `(function(){
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('js');
    return;
  }
  var SEL = '[data-reveal]:not([data-revealed])';
  var pending = new Set();
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var b = e.boundingClientRect;
      if (!b.width && !b.height) continue; // sin colocar todavía
      if (e.isIntersecting) show(e.target, 'anim');
      else if (b.bottom <= 0) show(e.target, 'instant');
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  function show(el, how) {
    el.setAttribute('data-revealed', how);
    io.unobserve(el);
    pending.delete(el);
  }
  function wait(el) {
    pending.add(el);
    io.observe(el);
  }
  // Primer vistazo: en pantalla o ya pasado = sin animación, antes del
  // primer pintado; debajo = a esperar el scroll.
  function place(el) {
    var r = el.getBoundingClientRect();
    if (!r.width && !r.height) wait(el); // sin colocar todavía
    else if (r.top < window.innerHeight) el.setAttribute('data-revealed', 'instant');
    else wait(el);
  }
  function scan(root) {
    if (root.matches && root.matches(SEL)) place(root);
    if (root.querySelectorAll) [].forEach.call(root.querySelectorAll(SEL), place);
  }
  // El observador solo avisa cuando un bloque CAMBIA de estado: si se lo
  // pasa de un salto (tecla Fin, barra, un scroll rápido con el hilo
  // ocupado) nunca "entró" y quedaba sin revelar hasta volver. Un barrido
  // por cuadro en el scroll lo resuelve.
  var ticking = false;
  function sweep() {
    ticking = false;
    var vh = window.innerHeight;
    pending.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      if (r.bottom <= 0) show(el, 'instant');
      else if (r.top < vh * 0.92) show(el, 'anim');
    });
  }
  window.addEventListener('scroll', function () {
    if (!ticking && pending.size) { ticking = true; requestAnimationFrame(sweep); }
  }, { passive: true });
  scan(document);
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var j = 0; j < added.length; j++) if (added[j].nodeType === 1) scan(added[j]);
    }
  }).observe(document.body, { childList: true, subtree: true });
})();`;
