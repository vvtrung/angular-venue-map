import { Component, input, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-switch',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './switch.component.html',
  styleUrl: './switch.component.css',
})
export class SwitchComponent {
  handleOnChange = input<((value: boolean) => void) | undefined>();
  className = input<string>('');
  checked = model<boolean>(false);

  onChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.checked.set(target.checked);
    this.handleOnChange()?.(target.checked);
  }
}
