# Sagrum_ — Supabase backend

Web obsah a administrácia používajú Supabase Auth, databázu Postgres a Storage. Videá sa nahrávajú po častiach, takže sa lepšie prenášajú aj pri slabšom pripojení.

## Čo potrebuješ na zverejnenie webu

Supabase bude ukladať obsah, prihlasovať administrátora a uchovávať videá. Samotné HTML/CSS/JavaScript súbory treba zverejniť na statickom web hostingu. Supabase tento frontend nehostuje; Edge Functions sú určené na API a ich vlastná dokumentácia odporúča hostovať frontend inde. Pozri [obmedzenia Edge Functions](https://supabase.com/docs/guides/functions/limits) a [GitHub integráciu](https://supabase.com/docs/guides/deployment/branching/github-integration).

## Nastavenie Supabase projektu

1. V GitHub integrácii nechaj **Working directory** nastavený na `.` — priečinok `supabase/` je v koreňovom priečinku repozitára.
2. Po nahratí zmien na produkčnú vetvu `main` integrácia aplikuje SQL migráciu a nastaví bucket `sagrum-clips`.
3. V Supabase otvor **Authentication → Users → Add user** a vytvor používateľa s e-mailom a heslom, ktoré budeš používať do administrácie.
4. Skopíruj UUID vytvoreného používateľa. V **SQL Editor** spusti tento príkaz a nahraď hodnotu UUID:

   ```sql
   insert into public.sagrum_admin_users (user_id)
   values ('UUID_ADMIN_POUZIVATELA');
   ```

5. V **Project Settings → API Keys** skopíruj **publishable key** (alebo starší `anon` public key) do `scripts/supabase-config.js`. URL projektu je už predvyplnená. Do webového kódu nikdy nevkladaj `secret` ani `service_role` key.
6. V **Authentication → URL Configuration** nastav Site URL na adresu svojho statického web hostingu.

## Vytvorenie statickej stránky

V koreňovom priečinku projektu spusti:

```sh
npm run build
```

Príkaz vytvorí priečinok `dist/` pripravený na publikovanie. Na statickom hostingu nastav build command `npm run build` a publish/output directory `dist`. Administrácia bude dostupná na `/admin`.

Supabase Free povoľuje súbory do 50 MB. Tento limit je nastavený aj v administrácii a buckete; na Free projekte ho nemožno zvýšiť nad 50 MB. Nahraté videá sú verejne prehrateľné, ale ich nahrávanie a mazanie povoľuje databázové pravidlo iba účtu pridanému do `sagrum_admin_users`.

## Kde upravovať súbory

- Stránky: `src/`
- Štýly: `style/`
- Prepojenie na Supabase: `scripts/supabase-config.js`, `scripts/supabase-data.js`, `scripts/site.js`, `scripts/admin.js`
- Databázová schéma a bezpečnostné pravidlá: `supabase/migrations/`
- Nastavenie Supabase CLI a Storage bucketu: `supabase/config.toml`

Po úprave zdrojových súborov ich treba znovu zostaviť cez `npm run build` a nahrať na statický web hosting. Zmeny v `supabase/migrations/` sa nasadzujú cez pripojenú GitHub integráciu.
