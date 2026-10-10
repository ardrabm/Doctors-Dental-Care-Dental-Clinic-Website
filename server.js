require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const app = express();
const port = Number(process.env.PORT || 3000);
const sheetName = process.env.GOOGLE_SHEET_NAME || 'Appointments';
const requiredEnv = ['GOOGLE_CLIENT_EMAIL', 'GOOGLE_PRIVATE_KEY', 'GOOGLE_SHEET_ID'];
const formSubmitEmail = String(process.env.FORMSUBMIT_EMAIL || '').trim();
const formSubmitConfigured = /^\S+@\S+\.\S+$/.test(formSubmitEmail);
const gmailConfigured = /^\S+@\S+\.\S+$/.test(String(process.env.EMAIL_USER || '').trim()) && Boolean(String(process.env.EMAIL_PASS || '').trim());
const twilioConfigured = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'DOCTOR_PHONE'].every(key => Boolean(process.env[key]));
const activeSlots = new Set();

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || `http://localhost:${port}` }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(__dirname));

const clean = value => String(value || '').replace(/[<>]/g, '').trim();
const pastDate = value => {
  const selected = new Date(`${value}T00:00:00`); const today = new Date(); today.setHours(0, 0, 0, 0);
  return Number.isNaN(selected.getTime()) || selected < today;
};
const sheetsApi = () => google.sheets({ version: 'v4', auth: new google.auth.JWT({ email: process.env.GOOGLE_CLIENT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] }) });
const sendEmail = appointment => nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } }).sendMail({ from: process.env.EMAIL_USER, to: appointment.email, subject: 'Appointment Confirmation – Dental Care Clinic', text: `Hello ${appointment.patientName},\n\nThank you for booking your appointment.\n\nYour appointment has been confirmed.\n\nAppointment Details:\n\nDoctor: ${appointment.doctor}\nDate: ${appointment.date}\nTime: ${appointment.time}\nTreatment: ${appointment.treatment}\n\nIf you need to reschedule, please contact us.\n\nThank you,\nDental Care Clinic` });
const sendClinicNotification = appointment => nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } }).sendMail({ from: process.env.EMAIL_USER, to: process.env.CLINIC_NOTIFY_EMAIL || process.env.EMAIL_USER, subject: `New appointment – ${appointment.patientName}`, text: `A new appointment has been booked.\n\nPatient: ${appointment.patientName}\nPhone: ${appointment.phone}\nEmail: ${appointment.email}\nDoctor: ${appointment.doctor}\nDate: ${appointment.date}\nTime: ${appointment.time}\nTreatment: ${appointment.treatment}\nMessage: ${appointment.message || 'None'}\nStatus: Pending` });
const sendFormSubmitNotification = appointment => fetch(`https://formsubmit.co/ajax/${encodeURIComponent(formSubmitEmail)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ _subject: `New dental appointment – ${appointment.patientName}`, _template: 'table', name: appointment.patientName, phone: appointment.phone, email: appointment.email, appointment_date: appointment.date, appointment_time: appointment.time, doctor: appointment.doctor, treatment: appointment.treatment, message: appointment.message || 'None', status: appointment.status }) }).then(async response => { if (!response.ok) throw new Error(`FormSubmit returned ${response.status}`); return response.json(); });
const smsNumber = number => String(number || '').startsWith('+') ? String(number) : `${process.env.SMS_DEFAULT_COUNTRY_CODE || '+91'}${String(number || '').replace(/^0+/, '')}`;
const sendPatientSms = appointment => twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({ from: process.env.TWILIO_PHONE_NUMBER, to: smsNumber(appointment.phone), body: `Doctors Dental Care\n\nHello ${appointment.patientName}, your appointment request has been received.\n\nDoctor: ${appointment.doctor}\nDate: ${appointment.date}\nTime: ${appointment.time}\nTreatment: ${appointment.treatment}\n\nWe will contact you if any change is needed.` });
const sendClinicSms = appointment => twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({ from: process.env.TWILIO_PHONE_NUMBER, to: smsNumber(process.env.DOCTOR_PHONE), body: `New Appointment\n\nPatient: ${appointment.patientName}\nPhone: ${appointment.phone}\nDoctor: ${appointment.doctor}\nDate: ${appointment.date}\nTime: ${appointment.time}\nTreatment: ${appointment.treatment}` });

app.get('/api/booking-status', async (req, res) => {
  if (requiredEnv.some(key => !process.env[key])) return res.status(503).json({ ready: false, message: 'Google Sheets settings are incomplete.' });
  try {
    const range = `'${sheetName.replace(/'/g, "''")}'!A1:J1`;
    await sheetsApi().spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range });
    return res.json({ ready: true, message: 'Booking is connected to Google Sheets.' });
  } catch (error) {
    const message = String(error.message || '');
    const friendly = /permission|forbidden|not found/i.test(message) ? 'Google Sheet access was denied. Share the sheet with the service-account email as Editor.' : /invalid_grant|credential|private key|jwt/i.test(message) ? 'The Google service-account key needs to be added again.' : 'Google Sheets could not be reached. Please check your internet connection and try again.';
    console.error('Booking status error:', message);
    return res.status(503).json({ ready: false, message: friendly });
  }
});

app.post('/api/appointments', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many booking attempts. Please try again in 15 minutes.' } }),
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Please enter a valid patient name.'),
  body('phone').trim().matches(/^\+?[1-9][0-9]{7,14}$/).withMessage('Please enter a valid phone number.'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Please enter a valid email address.'),
  body('date').trim().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Please choose a valid appointment date.'),
  body('time').trim().matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Please choose a valid appointment time.'),
  body('doctor').trim().isLength({ min: 2, max: 100 }).withMessage('Please select a doctor.'),
  body('treatment').trim().isLength({ min: 2, max: 100 }).withMessage('Please select a treatment.'),
  body('message').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Message is too long.'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ message: errors.array()[0].msg });
    if (pastDate(req.body.date)) return res.status(400).json({ message: 'Appointment date cannot be in the past.' });
    if (requiredEnv.some(key => !process.env[key])) return res.status(503).json({ message: 'Booking is temporarily unavailable. Please contact the clinic directly.' });
    const appointment = { patientName: clean(req.body.name), phone: clean(req.body.phone), email: clean(req.body.email), date: clean(req.body.date), time: clean(req.body.time), doctor: clean(req.body.doctor), treatment: clean(req.body.treatment), message: clean(req.body.message), status: 'Pending' };
    const key = `${appointment.doctor.toLowerCase()}|${appointment.date}|${appointment.time}`;
    if (activeSlots.has(key)) return res.status(409).json({ message: 'This appointment slot is already booked. Please choose another time.' });
    activeSlots.add(key);
    try {
      const range = `'${sheetName.replace(/'/g, "''")}'!A:J`;
      const sheets = sheetsApi();
      const existing = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range });
      if ((existing.data.values || []).slice(1).some(row => String(row[4] || '') === appointment.date && String(row[5] || '') === appointment.time && String(row[6] || '').toLowerCase() === appointment.doctor.toLowerCase())) return res.status(409).json({ message: 'This appointment slot is already booked. Please choose another time.' });
      await sheets.spreadsheets.values.append({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range, valueInputOption: 'USER_ENTERED', requestBody: { values: [[new Date().toISOString(), appointment.patientName, appointment.phone, appointment.email, appointment.date, appointment.time, appointment.doctor, appointment.treatment, appointment.message, appointment.status]] } });
      const notificationTasks = [
        ...(gmailConfigured ? [
          { label: 'Patient email', promise: sendEmail(appointment) },
          { label: 'Clinic email', promise: sendClinicNotification(appointment) }
        ] : []),
        ...(formSubmitConfigured ? [{ label: 'FormSubmit clinic notification', promise: sendFormSubmitNotification(appointment) }] : []),
        ...(twilioConfigured ? [
          { label: 'Patient SMS', promise: sendPatientSms(appointment) },
          { label: 'Clinic SMS', promise: sendClinicSms(appointment) }
        ] : [])
      ];
      Promise.allSettled(notificationTasks.map(task => task.promise)).then(results => {
        results.forEach((result, index) => { if (result.status === 'rejected') console.error(`${notificationTasks[index].label} failed`, result.reason.message); });
      });
      return res.status(201).json({ message: 'Appointment request received and saved. Our clinic will contact you soon.' });
    } catch (error) { console.error('Booking error:', error.message); return res.status(500).json({ message: 'Unable to save your appointment. Please try again or contact the clinic.' }); }
    finally { activeSlots.delete(key); }
  }
);

app.use((error, req, res, next) => { console.error('Unexpected error:', error.message); res.status(500).json({ message: 'An unexpected error occurred.' }); });
app.listen(port, () => console.log(`Dental Care booking server running at http://localhost:${port}`));
