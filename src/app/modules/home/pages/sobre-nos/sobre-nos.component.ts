import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { SeoService } from '../../../../core/services/seo-service.service';

@Component({
  selector: 'app-sobre-nos',
  templateUrl: './sobre-nos.component.html',
  standalone: false,
  styleUrl: './sobre-nos.component.scss'
})
export class SobreNosComponent implements OnInit {
  @ViewChild('meetDialog') private meetDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('meetTrigger') private meetTrigger?: ElementRef<HTMLButtonElement>;

  openMeetPhoto(): void {
    const dialog = this.meetDialog?.nativeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  closeMeetPhoto(): void {
    const dialog = this.meetDialog?.nativeElement;
    if (dialog?.open) {
      dialog.close();
      // The native "close" event can be asynchronous; restore focus immediately.
      this.meetTrigger?.nativeElement.focus();
    }
  }

  onMeetDialogClick(event: MouseEvent): void {
    // The dialog's backdrop dispatches a click with the dialog as its target.
    if (event.target === this.meetDialog?.nativeElement) {
      this.closeMeetPhoto();
    }
  }

  onMeetDialogClosed(): void {
    // Return focus to the thumbnail after close, including when Esc is pressed.
    this.meetTrigger?.nativeElement.focus();
  }

  constructor(private readonly seoService: SeoService) { }

  ngOnInit(): void {
    this.seoService.updateMetaTags(
      'Sobre a BraFurries — Nossa história e comunidade',
      'Saiba mais sobre a BraFurries, a comunidade furry brasileira, fundada em 10 de outubro de 2018, e conheça nossa trajetória, valores e projetos.'
    );
  }
}
