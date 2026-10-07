Update the already-deployed paystack-initialize function.

Inside the Paystack transaction initialization body, add:
callback_url: "https://zuutransshipping.com/?payment=success"

Keep PAYSTACK_SECRET_KEY only in Supabase Edge Function Secrets.
Never put the secret key in config.js or other website files.
