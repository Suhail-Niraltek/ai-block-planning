import { Component, computed, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { IconName, LUCIDE_PATHS } from './lucide-paths';

/**
 * Renders one Lucide icon as inline SVG.
 *
 * Icons are decorative by default and hidden from assistive technology, because
 * every icon in this application sits beside its own text label. Pass a `label`
 * only for an icon that carries meaning on its own.
 */
@Component({
  imports: [],
  selector: 'app-icon',
  styleUrl: './icon.scss',
  templateUrl: './icon.html',
  host: { class: 'inline-flex shrink-0' },
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconName>();
  /** Tailwind size classes, e.g. "h-4 w-4". */
  readonly size = input<string>('h-4 w-4');
  readonly strokeWidth = input<number>(2);
  readonly label = input<string | null>(null);

  protected readonly paths = computed<SafeHtml>(() =>
    // The path data is a compile-time constant from lucide-paths.ts and never
    // comes from user input or the API.
    this.sanitizer.bypassSecurityTrustHtml(LUCIDE_PATHS[this.name()] ?? ''),
  );
}
