ZuuTrans Duty Checker update

- Corrected displayed Paystack package prices to GHS 15 / 75 / 150.
- VIN decoding remains connected through the deployed Supabase vin-decode function.
- Added a customer-facing Ghana duty ESTIMATE section requiring a Customs/CIF value in GHS.
- Estimate uses published GRA vehicle-duty bands and 2026 VAT/levy rates, plus the Customs Act age-penalty schedule.
- The estimate is not a binding GRA/ICUMS assessment because the official customs valuation/HDV and classification may differ.
- Token wallet sync now preserves the Paystack reference before redirect, restores it on callback, retries verification briefly for webhook/DB timing, and updates the displayed balance from the verified server balance.
- The browser also decrements the displayed token count after a successful report generation; for production-grade enforcement, the report-generation endpoint should perform the authoritative server-side token consume.
