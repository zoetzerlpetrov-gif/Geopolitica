// Sin consultas de red ni datos de cuentas: sólo conserva la elección local de tema.
export const TEMA_JS = 'try{var t=localStorage.getItem("gp_theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}';
