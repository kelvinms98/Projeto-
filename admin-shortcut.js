document.addEventListener('keydown', (event) => {
  if (
    event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd'
    && !event.altKey && !event.metaKey
  ) {
    event.preventDefault();
    window.location.assign('/login');
  }
});
