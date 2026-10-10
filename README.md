# Doctors Dental Care booking integration

## 1. Install and run locally

1. Install Node.js 20 or later.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env` and add real values.
4. Run `npm start`.
5. Open `http://localhost:3000` (do not open `index.html` directly). The booking form posts to `/api/appointments`.

## 2. Google Sheets setup

1. Create a Google Cloud project and enable **Google Sheets API**.
2. Create a service account and create a JSON key for it.
3. Copy its `client_email` to `GOOGLE_CLIENT_EMAIL` and its `private_key` to `GOOGLE_PRIVATE_KEY`. Keep literal `\n` characters in the `.env` private key value.
4. Create a Google Sheet. Add a sheet tab named `Appointments` and put this header row in row 1:
   `Booking Time | Patient Name | Phone Number | Email | Appointment Date | Appointment Time | Doctor | Treatment | Message | Status`
5. Share the Google Sheet with the service account email as **Editor**.
6. Copy the spreadsheet ID from its URL into `GOOGLE_SHEET_ID`.

## 3. Gmail SMTP setup

1. Use a clinic Gmail/Google Workspace account.
2. Enable two-step verification for that account.
3. Create a Gmail **App Password** for Mail.
4. Put the account email in `EMAIL_USER` and the app password in `EMAIL_PASS`.

## 4. Twilio setup (optional)

1. Create a Twilio account and obtain a Twilio phone number with SMS enabled.
2. Add its Account SID, Auth Token, and phone number to the matching `TWILIO_*` variables.
3. Set `DOCTOR_PHONE` to the clinic/doctor number in E.164 format, for example `+919061223226`.

If you do not use Twilio, leave all four Twilio values blank. The appointment will still be saved to Google Sheets and the patient will still receive the email confirmation.

## 5. Production deployment

Deploy this folder to a Node.js-capable host such as Render, Railway, Fly.io, or a VPS. Set every `.env.example` value in the host's environment-variable dashboard, set `CORS_ORIGIN` to the deployed site URL, and start with `npm start`. Never upload `.env` or Google service-account keys to source control.

## Notes

- A booking is written to Google Sheets before email/SMS is attempted. Notification failures do not remove the booking.
- The API prevents duplicate bookings for the same doctor, date, and time.
- Rate limiting, Helmet headers, CORS, validation, and text sanitization are enabled.
