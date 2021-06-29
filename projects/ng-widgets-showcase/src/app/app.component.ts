import { Component } from '@angular/core';
import { DateTime, newDateTimeFormat } from '@tubular/time';
import { isAndroid, isIOS, isString } from '@tubular/util';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  private _customLocale = 'en-GB';

  mobile = isAndroid() || isIOS();
  native = false;
  time = new DateTime().taiMillis;
  title = 'tz-explorer';

  get customLocale(): string { return this._customLocale; }
  set customLocale(newValue: string) {
    if (this._customLocale !== newValue) {
      try {
        new Intl.DateTimeFormat(newValue);
      }
      catch {
        return;
      }

      this._customLocale = newValue;
    }
  }

  setCurrentTime(): void {
    this.time = new DateTime().taiMillis;
  }

  format(zone: string = null, locale: string = null, fmt: string | Intl.DateTimeFormatOptions): string {
    const dt = new DateTime({ tai: this.time }, zone, locale);
    let result: string;

    if (isString(fmt))
      result = dt.format(fmt);
    else {
      if (zone)
        fmt.timeZone = zone;

      result = newDateTimeFormat(locale, fmt).format(dt.utcMillis);
    }

    return result;
  }
}
