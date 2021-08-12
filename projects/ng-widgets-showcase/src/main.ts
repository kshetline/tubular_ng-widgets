import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { initTimezoneLarge } from '@tubular/time';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

initTimezoneLarge();

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
