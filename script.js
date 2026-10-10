const menuButton = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
menuButton.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', open);
});
document.querySelectorAll('.nav-links a').forEach(link => link.addEventListener('click', () => {
  navLinks.classList.remove('open'); menuButton.setAttribute('aria-expanded', 'false');
}));
const observer = new IntersectionObserver((entries) => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(item => observer.observe(item));

const treatmentModal = document.querySelector('#treatment-modal');
const modalTitle = document.querySelector('#modal-title');
const modalDescription = document.querySelector('#modal-description');
const treatmentCards = document.querySelectorAll('.treatment-card');
const openTreatment = (card) => {
  modalTitle.textContent = card.querySelector('h3').textContent;
  modalDescription.textContent = card.querySelector('p').textContent;
  treatmentModal.classList.add('is-open');
  treatmentModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  treatmentModal.querySelector('.modal-close').focus();
};
treatmentCards.forEach(card => {
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.addEventListener('click', event => {
    if (!event.target.closest('a')) window.location.href = card.querySelector('a').href;
  });
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.location.href = card.querySelector('a').href; }
  });
});
const closeTreatment = () => {
  treatmentModal.classList.remove('is-open');
  treatmentModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
};
document.querySelectorAll('[data-close-modal]').forEach(item => item.addEventListener('click', closeTreatment));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTreatment(); });

// Doctor manager: records are stored only in this browser using localStorage.
const doctorGrid = document.querySelector('#doctor-grid');
const manageDoctorsButton = document.querySelector('#manage-doctors-button');
const doctorAdminModal = document.querySelector('#doctor-admin-modal');
const doctorForm = document.querySelector('#doctor-form');
const doctorAdminList = document.querySelector('#doctor-admin-list');
const doctorStorageKey = 'doctors-dental-care-team';
const fallbackPhoto = 'assets/doctor-team.png';
const defaultDoctors = [
  { name: 'Clinical Team', role: 'Dental Specialist', photo: fallbackPhoto, position: '0% center' },
  { name: 'Clinical Team', role: 'Restorative Dentistry', photo: fallbackPhoto, position: '25% center' },
  { name: 'Dr. Arjun Rajeev', role: 'Chief Dental Surgeon', photo: fallbackPhoto, position: '50% center', lead: true },
  { name: 'Clinical Team', role: 'Orthodontic Care', photo: fallbackPhoto, position: '75% center' },
  { name: 'Clinical Team', role: 'Consultant Dentist', photo: fallbackPhoto, position: '100% center' }
];
const getDoctors = () => {
  try { return JSON.parse(localStorage.getItem(doctorStorageKey)) || defaultDoctors; }
  catch { return defaultDoctors; }
};
const saveDoctors = doctors => localStorage.setItem(doctorStorageKey, JSON.stringify(doctors));
const escapeHTML = value => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const renderDoctors = () => {
  const doctors = getDoctors();
  doctorGrid.innerHTML = doctors.map((doctor, index) => `<article class="doctor-card${doctor.lead ? ' lead' : ''} reveal is-visible"><img src="${escapeHTML(doctor.photo)}" style="object-position:${escapeHTML(doctor.position || 'center')}" alt="${escapeHTML(doctor.name)}" /><div><span>${escapeHTML(doctor.role)}</span><h3>${escapeHTML(doctor.name)}</h3></div></article>`).join('');
  doctorAdminList.innerHTML = doctors.map((doctor, index) => `<div class="doctor-admin-item"><img src="${escapeHTML(doctor.photo)}" alt="" /><div><b>${escapeHTML(doctor.name)}</b><span>${escapeHTML(doctor.role)}</span></div><button class="remove-doctor" type="button" data-doctor-index="${index}">Remove</button></div>`).join('');
  doctorAdminList.querySelectorAll('.remove-doctor').forEach(button => button.addEventListener('click', () => {
    const updated = getDoctors();
    updated.splice(Number(button.dataset.doctorIndex), 1);
    saveDoctors(updated); renderDoctors(); window.refreshBookingDoctors?.();
  }));
};
const openDoctorAdmin = () => { doctorAdminModal.classList.add('is-open'); doctorAdminModal.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open'); };
const closeDoctorAdmin = () => { doctorAdminModal.classList.remove('is-open'); doctorAdminModal.setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); };
manageDoctorsButton.addEventListener('click', openDoctorAdmin);
document.querySelectorAll('[data-close-doctor-admin]').forEach(item => item.addEventListener('click', closeDoctorAdmin));
doctorForm.addEventListener('submit', event => {
  event.preventDefault();
  const values = new FormData(doctorForm);
  const doctors = getDoctors();
  doctors.push({ name: values.get('name').trim(), role: values.get('role').trim(), photo: values.get('photo').trim() || fallbackPhoto, position: '50% center' });
  saveDoctors(doctors); doctorForm.reset(); renderDoctors(); window.refreshBookingDoctors?.();
});
renderDoctors();

