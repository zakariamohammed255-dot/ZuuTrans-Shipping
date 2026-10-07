ZuuTrans Shipping — custom HTML/CSS/JavaScript site
===================================================

Files
-----
index.html   Main website page
styles.css   Design and responsive styling
script.js    Shipment tracking logic
config.js    Supabase browser configuration

Supabase connection
-------------------
This project is connected to the ZuuTrans Supabase project:
https://amkmzuefeihawfvlmrra.supabase.co

The tracking form calls this RPC function:
get_shipment_by_tracking_number(text)

Test tracking numbers already created in the database:
ZTS-000001
ZTS-100001

How to test on Windows
----------------------
1. Extract this folder.
2. Open the folder in VS Code.
3. Install the "Live Server" extension, then right-click index.html and choose "Open with Live Server".
4. In the website, enter ZTS-100001 and click Track Shipment.

Do not replace the publishable key with a Supabase secret/service-role key.


Netlify Forms note: netlify-forms.html is a static form blueprint included so Netlify can detect quote-request during deploy.

Quote form testing:
- When index.html is opened directly from the computer (file://), submitting the quote form shows a local readiness confirmation because Netlify Forms cannot receive a local file POST.
- On the live Netlify site, the same form submits through Netlify Forms and can be verified in the Netlify dashboard.


CAR DUTY CHECKER: Added an official ICUMS vehicle duty lookup section linking directly to Ghana Customs/ICUMS. It does not calculate or alter official duty values.



PAID CAR DUTY CHECKER — PAYSTACK CONNECTION
============================================
The website is now wired to the deployed Supabase paystack-initialize function.

1. Customer enters email and optional phone/WhatsApp.
2. Choosing a package calls paystack-initialize.
3. Customer is redirected to Paystack checkout.
4. Existing Paystack webhook remains the authoritative token-credit path.
5. On return, the website calls paystack-status to verify the reference and read the wallet balance.

BACKEND STEP BEFORE LIVE TESTING
- Deploy supabase/functions/paystack-status/index.ts as a Supabase Edge Function named paystack-status.
- In paystack-initialize, add:
  callback_url: "https://zuutransshipping.com/?payment=success"
  to the Paystack transaction initialization body.
- Keep PAYSTACK_SECRET_KEY only in Supabase Edge Function Secrets.
- Never put PAYSTACK_SECRET_KEY in config.js or any public website file.

The vehicle report remains a preview until an authorised/verified vehicle valuation source is connected. The site must not invent an exact customs amount.


CURRENT DUTY CHECK PRICING
1 check = GHS 15
5 checks = GHS 75
10 checks = GHS 150
