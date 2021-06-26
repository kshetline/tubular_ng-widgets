import { Component } from '@angular/core';
import { DateTime } from '@tubular/time';
import { isString } from '@tubular/util';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  native = false;
  time = new DateTime().taiMillis;
  title = 'tz-explorer';

  setCurrentTime(): void {
    this.time = new DateTime().taiMillis;
  }

  format(zone: string = null, locale: string = null, fmt: string | Intl.DateTimeFormatOptions): string {
    const dt = new DateTime(null, zone, locale);
    dt.taiMillis = this.time;

    if (isString(fmt))
      return dt.format(fmt);

    if (zone)
      fmt.timeZone = zone;

    return new Intl.DateTimeFormat(locale, fmt).format(dt.utcMillis);
  }
}
