// public/js/app.js

let currentPage = null;
let currentParams = {};

function navigate(page, params = {}) {
  currentPage = page;
  currentParams = params;

  // Update nav active state
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  switch (page) {
    case 'cases':
    case 'case-list':
      renderCaseList();
      break;
    case 'new-case':
      renderCaseCreate();
      break;
    case 'case-detail':
      renderCaseDetail(params);
      break;
    case 'exclusion-notice':
      renderExclusionNotice(params);
      break;
    default:
      renderCaseList();
  }
}

// Nav link clicks
document.querySelectorAll('.nav-link').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    navigate(a.dataset.page);
  });
});

// Start on case list
navigate('cases');
