if (
  localStorage.theme === 'dark' ||
  (!localStorage.theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
) {
  document.documentElement.classList.add('dark');
}
