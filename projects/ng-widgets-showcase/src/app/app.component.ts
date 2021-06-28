import { Component } from '@angular/core';
import { DateTime } from '@tubular/time';
import { convertDigits, convertDigitsToAscii, isAndroid, isIOS, isString } from '@tubular/util';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  mobile = isAndroid() || isIOS();
  native = false;
  time = new DateTime().taiMillis;
  title = 'tz-explorer';

  setCurrentTime(): void {
    this.time = new DateTime().taiMillis;
  }

  format(zone: string = null, locale: string = null, fmt: string | Intl.DateTimeFormatOptions): string {
    const dt = new DateTime(null, zone, locale);
    let result: string;
    const base: string[] = [];

    dt.taiMillis = this.time;

    if (isString(fmt))
      result = dt.format(fmt);
    else {
      if (zone)
        fmt.timeZone = zone;

      result = new Intl.DateTimeFormat(locale, fmt).format(dt.utcMillis);

      if (locale === 'ar' && fmt.era)
        result = result.replace(/(\d\d) (\d\d) (\d\d\d\d)/, '$3/$2/$1');
    }

    result = convertDigitsToAscii(result, base);
    result = result.replace(/\b(\d)\b/g, '0$1');
    result = convertDigits(result, base[0]);

    return result;
  }
}
