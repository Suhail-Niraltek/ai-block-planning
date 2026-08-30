import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './components/layout/sidebar/sidebar';
import { Topbar } from './components/layout/topbar/topbar';
import { ThemeService } from './services/theme-service/theme-service';

@Component({
  imports: [RouterOutlet, Sidebar, Topbar],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  // Injected so the theme effects run for the lifetime of the application.
  protected readonly theme = inject(ThemeService);
}
