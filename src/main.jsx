import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowRight, Heart, Sparkles, Menu, X, ChevronDown, Check, Copy, MessageCircle, MapPin, Clock, MoveUpRight, Pause, Play } from 'lucide-react';
import { school } from './school';
import './styles.css';

const asset = (name) => `${import.meta.env.BASE_URL}images/${name}`;
const links = [['Vivências', 'vivencias']];

function Brand({ footer = false }) {
  return (
    <a className={`brand ${footer ? 'brand-footer' : ''}`} href="#inicio" aria-label="Creche Escola Sonho de Criança — início">
      <img src={asset('marca-cesc.png')} width="600" height="365" alt="" />
    </a>
  );
}
const experiences = [
  { image: 'festa-anos-80-dupla.webp', label: 'Duas crianças fantasiadas no tapete colorido da festa anos 80' },
  { image: 'festa-anos-80-oculos.webp', label: 'Criança de óculos brancos diante do painel do Dia das Crianças' },
  { image: 'festa-anos-80-bandana.webp', label: 'Criança de bandana vermelha e jaqueta jeans no cenário da festa' },
];

function Flower({ className = '' }) {
  return <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M50 28C20-10-10 23 28 50-10 78 23 110 50 72c28 38 60 5 22-22 38-28 5-60-22-22Z" fill="currentColor"/><circle cx="50" cy="50" r="13" fill="#fff9eb"/><path d="M44 49h1m11 0h1m-12 7q6 6 12 0" stroke="#102a67" strokeWidth="3" strokeLinecap="round"/></svg>;
}
const banners = [
  {
    name: 'Apresentação da escola',
    eyebrow: 'UM COMEÇO CHEIO DE POSSIBILIDADES',
    title: ['Pequenos passos.', 'Descobertas', 'gigantes'],
    description: 'Uma infância com espaço para brincar, imaginar e crescer. Cada criança, um universo inteiro de possibilidades.',
    image: 'festa-anos-80-capa.webp',
    alt: 'Criança de vestido branco na festa anos 80 da escola',
    action: 'Quero conhecer a escola',
    href: '#contato',
  },
  {
    name: 'Vivências',
    eyebrow: 'VIVÊNCIAS',
    title: ['Histórias,', 'cores e', 'movimento'],
    description: 'Veja as crianças da Sonho de Criança em uma das atividades da escola.',
    image: experiences[0].image,
    alt: experiences[0].label,
    action: 'Ver fotos da escola',
    href: '#vivencias',
  },

];
const bannerNames = ['Pré-matrícula', ...banners.map(({name}) => name)];

function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [linkFocused, setLinkFocused] = useState(false);
  const showEnrollment = active === 0;
  const banner = banners[active - 1] ?? banners[0];

  useEffect(() => {
    if (paused || linkFocused) return;
    const timer = window.setTimeout(() => setActive((active + 1) % bannerNames.length), 7000);
    return () => window.clearTimeout(timer);
  }, [active, paused, linkFocused]);

  return (
    <section
      id="inicio"
      className={`hero section-wrap${showEnrollment ? ' hero-show-enrollment' : ''}`}
      aria-label="Destaques da escola"
      aria-roledescription="carrossel"
      onFocus={event => setLinkFocused(event.target instanceof HTMLAnchorElement)}
      onBlur={() => setLinkFocused(false)}
    >
      {showEnrollment && (
        <a className="hero-enrollment" href="./portal.html">
          <h2>Matrículas <strong>abertas</strong></h2>
          <span className="hero-enrollment-action">Fazer pré-matrícula <ArrowRight size={22} aria-hidden="true" /></span>
        </a>
      )}
      <div className="hero-carousel-text">
        <div className="hero-carousel-copy">
          {banners.map(({name, eyebrow, title, description, action, href}, index) => {
            const Heading = index === 0 ? 'h1' : 'h2';
            return (
              <div
                key={name}
                className="hero-copy"
                role="group"
                aria-roledescription="banner"
                aria-label={name}
                inert={index + 1 !== active}
              >
                <span className="eyebrow"><span className="little-line" />{eyebrow}</span>
                <Heading className="hero-slide-heading">
                  {title[0]}<br />
                  <span className="hero-accent">{title[1]}</span><br />
                  <span className="highlight">{title[2]}<svg viewBox="0 0 400 20" aria-hidden="true"><path d="M5 12Q180-3 390 10M35 19Q180 7 340 16" /></svg></span><span className="coral">.</span>
                </Heading>
                <p>{description}</p>
                <div className="hero-actions">
                  <a className="text-link" href={href}>
                    {action} <ArrowRight size={18} aria-hidden="true" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
        <div className="hero-footnote"><Heart size={17} aria-hidden="true" /><span>Para crianças de <strong>2 a 5 anos</strong>. Para uma infância inteira.</span></div>
        <div className="hero-carousel-controls" role="group" aria-label="Controles dos banners">
          {bannerNames.map((name, index) => (
            <button key={name} type="button" aria-label={`Mostrar banner: ${name}`} aria-pressed={active === index} onClick={() => setActive(index)}>
              <span aria-hidden="true" />
            </button>
          ))}
          <button type="button" aria-label={paused ? 'Ativar rotação automática' : 'Pausar rotação automática'} onClick={() => setPaused(!paused)}>
            {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>
      <div className="hero-visual">
        <div className="photo-outline" />
        <img className="hero-photo" src={asset(banner.image)} width="360" height="640" fetchPriority={active === 1 ? 'high' : 'auto'} alt={banner.alt} />
        <span className="photo-tag"><span className="tag-sun" aria-hidden="true">✳</span> Ser criança é uma descoberta diária.</span>
        <div className="round-stamp"><span>BRINCAR É</span><Heart fill="currentColor" size={26} aria-hidden="true" /><span>COISA SÉRIA</span></div>
        <Flower className="hero-flower" />
        <svg className="hero-doodle" viewBox="0 0 100 100" aria-hidden="true"><path d="M14 70Q70 10 82 50q-1 22-27 6t-5-38M83 13l-3 16 16-5" /></svg>
      </div>
    </section>
  );
}

function App() {
  const [menu, setMenu] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (gallery === null) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const key = e => { if (e.key === 'Escape') setGallery(null); if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); } };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = old; window.removeEventListener('keydown', key); openerRef.current?.focus(); };
  }, [gallery]);

  function prepareContact(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = `Olá! Gostaria de conhecer a ${school.fullName}. Meu nome é ${data.get('name')}. Tenho interesse para uma criança de ${data.get('age')} anos. ${data.get('note') || ''}`;
    setMessage(text); setSubmitted(true); setCopied(false);
  }
  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); setCopied(true); }
    catch { setCopied(false); }
  }

  return <>
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <div className="topline"><span>Pequenas descobertas. Grandes começos.</span><span><span className="status-dot"/> Educação infantil · 2 a 5 anos</span></div>
    <header><div className="nav-wrap"><Brand/><nav id="main-navigation" aria-label="Menu principal" className={menu ? 'is-open' : ''}>{links.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}<a href={school.instagram} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>Instagram</a><a className="button small nav-contact" href="#contato" onClick={() => setMenu(false)}>Vamos conversar <ArrowUpRight size={17}/></a></nav><button className="menu-toggle" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></div></header>
    <main id="conteudo">
      <HeroCarousel />
      <div className="values-ribbon" aria-label="Valores que inspiram este projeto"><div><span>Aprender brincando</span><Sparkles/><span>Crescer com afeto</span><Sparkles/><span>Imaginar sem limites</span><Sparkles/><span>Descobrir o mundo</span><Sparkles/></div></div>
      <section id="vivencias" className="section-wrap section-space experiences">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Vivências</span>
            <h2>É brincando que o<br/>mundo fica <span className="coral-text">maior.</span></h2>
          </div>
          <p>Festa anos 80 na Creche Escola Sonho de Criança</p>
        </div>
        <div className="experience-grid">
          {experiences.map(({ image, label }) => (
            <button
              key={image}
              className="experience-card"
              onClick={event => { openerRef.current = event.currentTarget; setGallery({ image, label }); }}
              aria-label={`Ampliar imagem: ${label}`}
            >
              <span className="experience-photo">
                <img src={asset(image)} width="360" height="640" loading="lazy" alt="" />
                <span className="expand-icon"><MoveUpRight size={20} aria-hidden="true" /></span>
              </span>
            </button>
          ))}
        </div>
        <a className="text-link experience-instagram" href={school.instagram} target="_blank" rel="noreferrer">
          Mais registros no Instagram <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>
      <section className="faq-section section-wrap section-space"><div><span className="eyebrow">PARA AS FAMÍLIAS</span><h2>Uma boa conversa<br/>é o primeiro passo.</h2><p>Reunimos algumas informações para<br/>começar a conhecer a escola.</p><Flower className="faq-flower"/></div><div className="faq-list">{[['Qual a faixa etária da escola?','Este projeto apresenta a Creche Escola Sonho de Criança para famílias com crianças de 2 a 5 anos. A distribuição das turmas deve ser confirmada com a secretaria.'],['Como conhecer a escola?','Use a seção de contato para preparar sua mensagem de interesse. O contato oficial da secretaria será incluído assim que for confirmado.'],['Quais são os horários e turnos?','Os horários de funcionamento e os turnos disponíveis ainda serão informados pela direção. Assim que confirmados, estarão disponíveis aqui.'],['Estas são fotos reais da escola?','Sim. As imagens mostram crianças da escola na festa anos 80 e foram publicadas no Instagram oficial.']].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={20}/></summary><p>{answer}</p></details>)}</div></section>
      <section id="contato" className="contact-section"><div className="section-wrap contact-layout"><div><span className="eyebrow">VAMOS NOS CONHECER?</span><h2>Todo grande sonho<br/>começa com um<br/><span>pequeno olá.</span></h2><p>Conte em qual fase sua criança está.<br/>Vamos preparar o começo dessa conversa.</p><div className="contact-info"><span><MapPin size={18}/>{school.address || 'Endereço em atualização'}</span><span><Clock size={18}/>{school.hours || 'Horários a confirmar com a secretaria'}</span></div></div><div className="contact-form-wrap"><h3>O primeiro passo é seu.</h3><p className="form-intro">Prepare uma mensagem para a secretaria.</p><form onSubmit={prepareContact}><label htmlFor="name">Seu nome</label><input id="name" name="name" placeholder="Como podemos chamar você?" required maxLength={100} autoComplete="given-name" onChange={() => setSubmitted(false)}/><label htmlFor="age">Idade da criança</label><select id="age" name="age" required defaultValue="" onChange={() => setSubmitted(false)}><option value="" disabled>Selecione a idade</option>{[2,3,4,5].map(a => <option key={a} value={a}>{a} anos</option>)}</select><label htmlFor="note">Quer contar algo mais? <span>(opcional)</span></label><textarea id="note" name="note" placeholder="Uma dúvida ou o que você gostaria de conhecer…" maxLength={800} rows={2} onChange={() => setSubmitted(false)}/><button className="button" type="submit">Preparar minha mensagem <ArrowUpRight size={18}/></button><p className="form-note">Nenhum dado é enviado ou salvo por este formulário.</p></form>{submitted && <div className="message-result" role="status"><strong>Mensagem pronta!</strong><textarea aria-label="Mensagem preparada para copiar" readOnly value={message} rows={4}/>{school.whatsapp ? <a className="text-link" href={`https://wa.me/${school.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Continuar no WhatsApp</a> : <><p>O WhatsApp oficial ainda será cadastrado. Você pode copiar a mensagem, mas ela ainda não foi enviada.</p><button className="text-link" onClick={copyMessage}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Mensagem copiada' : 'Copiar mensagem'}</button></>}</div>}</div></div></section>
    </main>
    <footer className="section-wrap"><div className="footer-top"><Brand footer/><span>Infância para viver.<br/><strong>Sonhos para levar.</strong></span><a href="#inicio" className="back-top">Voltar ao topo <ArrowUpRight size={19}/></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {school.fullName}.</span><span>Primeira versão · Conteúdo institucional em validação</span><a href="./portal.html">Portal da família</a><a href="./portal.html?area=secretaria">Secretaria</a><a href="#contato">Fale com a escola</a><a href={school.instagram} target="_blank" rel="noreferrer">Instagram</a></div></footer>
    {gallery !== null && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setGallery(null)}><button ref={closeRef} className="lightbox-close" aria-label="Fechar imagem" onClick={() => setGallery(null)}><X/></button><div className="lightbox-content" onClick={e => e.stopPropagation()}><img src={asset(gallery.image)} width="360" height="640" alt={gallery.label} /></div></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
