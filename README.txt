SAGRUM_ — WEB + ADMINISTRÁCIA
==============================

ČO JE V BALÍKU
--------------
- Samostatné stránky Domov, Info, Portfólio, Clipy a Kontakt.
- Na hlavnej stránke je logo za stredovou cyan → blue gradientovou bublinou.
- Responzívne rozloženie a jemné animácie.
- Pôvodná administrácia zostala zachovaná: prihlásenie, úprava textov, sociálne odkazy,
  nahrávanie a mazanie klipov.
- Obsah sa ukladá na server do JSON súboru a videá do úložiska servera.
- Verejní návštevníci vidia rovnaký obsah načítaný zo servera.

DÔLEŽITÉ: TOTO NIE JE ČISTO STATICKÝ WEB
---------------------------------------
Administrácia a nahrávanie videí potrebujú Node.js server. ZIP preto nahraj na hosting,
ktorý podporuje Node.js aplikácie a trvalé úložisko (persistent disk/volume). Samotné
nahratie na statický hosting bez backendu nebude fungovať.

NASADENIE CEZ RENDER BLUEPRINT
-----------------------------
V koreňovom priečinku je render.yaml. Render ho vie použiť ako Blueprint konfiguráciu.
1. Nahraj celý rozbalený projekt do Git repozitára, ktorý vie Render nasadiť.
2. V Render Dashboard vyber New → Blueprint a vyber daný repozitár.
3. Pri vytváraní služby nastav ADMIN_USERNAME a ADMIN_PASSWORD.
   Heslo musí mať aspoň 12 znakov a nepoužívaj heslo z iného účtu.
4. Blueprint nastaví Node server, health check a 1 GB persistent disk pre texty a videá.
5. Po nasadení otvor adresu služby. Admin panel je na /admin.

Render konfigurácia používa platený plán s persistent diskom. Disk je potrebný preto,
aby uložené texty a nahraté videá zostali zachované po reštarte alebo novom nasadení.

NASADENIE NA INOM NODE.JS HOSTINGU
---------------------------------
- Node.js 20 alebo novší.
- Build/install command: npm install
- Start command: npm start
- Environment variables:
    NODE_ENV=production
    ADMIN_USERNAME=tvoje-admin-meno
    ADMIN_PASSWORD=tvoje-jedinecne-heslo-aspon-12-znakov
    DATA_DIR=<cesta-na-trvalom-ulozisku>/data
    UPLOAD_DIR=<cesta-na-trvalom-ulozisku>/uploads
- Pripoj persistent disk/volume a nastav DATA_DIR aj UPLOAD_DIR na tento disk.
- Použi hosting s HTTPS. V produkcii sa admin cookie nastavuje ako Secure.

LOKÁLNE SPUSTENIE NA WINDOWS
----------------------------
1. Nainštaluj Node.js 20 alebo novší.
2. Otvor priečinok projektu vo VS Code.
3. Skopíruj .env.example ako .env.
4. V .env nastav ADMIN_USERNAME a ADMIN_PASSWORD (aspoň 12 znakov).
5. V termináli spusti:
     npm install
     npm start
6. Web: http://localhost:3000
   Administrácia: http://localhost:3000/admin

ADMINISTRÁCIA
-------------
- Hero text, portfólio text, text ku klipom, nadpis a text Info.
- Instagram, TikTok, Discord server a URL online objednávania.
- Nahrávanie MP4, WebM a MOV videí do veľkosti 120 MB na jeden súbor.
- Mazanie nahratých klipov.

BEZPEČNOSŤ A ÚDRŽBA
-------------------
- Verejný admin účet sa neregistruje. Existuje iba meno a heslo nastavené cez prostredie.
- Admin cookie je HttpOnly a SameSite=Strict; v produkcii aj Secure.
- Po 8 neúspešných prihláseniach z jednej IP sa ďalšie pokusy na 15 minút zablokujú.
- Zálohuj persistent úložisko (priečinky data a uploads na lokálnom serveri, alebo ich
  nakonfigurované ekvivalenty v produkcii).
- Nikdy nezverejňuj .env ani prihlasovacie údaje.
- Videá sa ukladajú na persistent disk. Na Render je disk v tomto nastavení 1 GB;
  kapacitu možno podľa potreby zvýšiť v nastaveniach služby.
