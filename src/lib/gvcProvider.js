export const Gvc = (await import('gi://Gvc')).default;

let control = null;

export function getMixerControl() {
    if (!control) {
        control = new Gvc.MixerControl({name: 'budslink'});
        control.open();
    }
    return control;
}
export const Volume = {getMixerControl};

