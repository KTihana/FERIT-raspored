import logo from './assets/ferit-symbol.svg';
import './launch-screen.css';

export function LaunchScreen() {
  return <main className="launch-screen" aria-busy="true" aria-label="Učitavanje aplikacije FERIT raspored">
    <img className="launch-screen__logo" src={logo} alt="" aria-hidden="true"/>
    <h1 className="launch-screen__title"><span>FERIT</span><span>raspored</span></h1>
    <div className="launch-screen__progress" role="status" aria-label="Učitavanje"/>
  </main>;
}
