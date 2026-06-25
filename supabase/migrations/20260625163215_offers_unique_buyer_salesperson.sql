-- 同一 buyer から同一 salesperson へのオファーは MVP では 1 件のみ許可
ALTER TABLE public.offers
  ADD CONSTRAINT offers_buyer_salesperson_unique UNIQUE (buyer_id, salesperson_id);
