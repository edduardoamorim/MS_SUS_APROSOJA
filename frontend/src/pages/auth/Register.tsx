import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Loader2, Eye, EyeOff, CheckCircle2, ShieldCheck, MapPin, Phone, Mail, User, Lock, Sparkles, Building2, ChevronRight } from 'lucide-react';
import PropertyCodeInput, { type PropertyCodeResult } from '../../components/form/PropertyCodeInput';
import { useToast } from '../../context/ToastContext';

export default function Register() {
  const navigate = useNavigate();
  const { success, error: toastError, warning } = useToast();

  // Seção 1: Dados do Produtor
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role] = useState<'produtor'>('produtor');

  // Seção 2: Dados da Fazenda & Soja
  const [areaSojaHa, setAreaSojaHa] = useState('');
  const [propertyData, setPropertyData] = useState<PropertyCodeResult | null>(null);

  // Estados UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      return setError('Informe o nome completo do produtor.');
    }

    if (!email.trim()) {
      return setError('Informe um e-mail válido.');
    }

    if (!phone.trim()) {
      return setError('Informe o número de telefone/WhatsApp.');
    }

    if (password !== confirmPassword) {
      return setError('As senhas não coincidem.');
    }

    if (password.length < 8) {
      return setError('A senha deve ter pelo menos 8 caracteres.');
    }

    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!PASSWORD_REGEX.test(password)) {
      return setError('A senha deve conter maiúscula, minúscula, número e caractere especial.');
    }

    setLoading(true);

    try {
      const cleanName = name.trim();
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();
      let userId: string | undefined;

      // 1. Criar ou recuperar conta de autenticação no Supabase
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            role: 'produtor',
            phone: cleanPhone
          }
        }
      });

      if (signUpError) {
        const isAlreadyRegistered =
          signUpError.message?.toLowerCase().includes('already registered') ||
          signUpError.message?.toLowerCase().includes('already exists');

        if (isAlreadyRegistered) {
          // Caso o produtor tenha sido pré-cadastrado pelo Técnico ou Gestor (com Senha@123) ou já tenha conta
          let signInRes = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password
          });

          if (signInRes.error) {
            signInRes = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password: 'Senha@123'
            });
            if (!signInRes.error && signInRes.data.user) {
              // Atualiza para a senha escolhida pelo produtor no formulário
              await supabase.auth.updateUser({
                password,
                data: { full_name: cleanName, role: 'produtor', phone: cleanPhone }
              });
            }
          }

          if (signInRes.error || !signInRes.data.user) {
            throw new Error('Este e-mail já possui cadastro ativo. Faça login na tela inicial ou utilize a senha padrão Senha@123.');
          }
          userId = signInRes.data.user.id;
        } else {
          throw signUpError;
        }
      } else {
        userId = authData.user?.id;
      }

      const nowIso = new Date().toISOString();

      // 2. Reconciliar perfil na tabela 'perfis' e herdar fazendas pré-cadastradas pelo Técnico/Gestor
      let canonicalId = userId;
      try {
        const { data: recData, error: recErr } = await supabase.rpc('reconciliar_perfil_produtor', {
          p_auth_id: userId || null,
          p_email: cleanEmail,
          p_nome: cleanName,
          p_telefone: cleanPhone,
          p_regiao: null,
          p_role: 'produtor'
        });
        if (!recErr && recData?.id) {
          canonicalId = recData.id;
        }
      } catch (recEx) {
        console.warn('Aviso ao reconciliar perfil no registro:', recEx);
      }

      if (canonicalId) {
        await supabase.from('perfis').upsert([{
          id: canonicalId,
          nome: cleanName,
          email: cleanEmail,
          telefone: cleanPhone,
          role: 'produtor',
          status: 'Ativo',
          updated_at: nowIso
        }]);

        // 3. Inserir fazenda inicial se identificada no formulário
        if (propertyData && (propertyData.nome_fazenda || propertyData.codigo_car || propertyData.codigo_sigef || propertyData.geom)) {
          const farmName = propertyData.nome_fazenda?.trim() || `Fazenda ${propertyData.codigo_car || propertyData.codigo_sigef || cleanName}`;
          const newProp = {
            produtor_id: canonicalId,
            nome_fazenda: farmName,
            etapa: 'Prospecção',
            nome_produtor: cleanName,
            area_soja_ha: areaSojaHa ? parseFloat(areaSojaHa) : null,
            codigo_car: propertyData.origem === 'CAR' ? propertyData.codigo_car : null,
            codigo_sigef: propertyData.origem === 'SIGEF' ? propertyData.codigo_sigef : null,
            origem_cadastro: propertyData.origem || 'CAR',
            geom: propertyData.geom || null,
            created_at: nowIso,
            updated_at: nowIso
          };

          const { data: insertedProp } = await supabase
            .from('propriedades')
            .insert([newProp])
            .select('id')
            .maybeSingle();

          if (insertedProp?.id) {
            try {
              await supabase.from('auditorias').insert([{
                propriedade_id: insertedProp.id,
                status: 'Autoavaliação',
                etapa: 'Prospecção',
                data_agendamento: nowIso
              }]);
            } catch (e) {}

            try {
              await supabase.rpc('reconciliar_perfil_produtor', {
                p_auth_id: canonicalId,
                p_role: 'produtor'
              });
            } catch (e) {}
          }
        }
      }

      success('Conta e cadastro de produtor realizados com sucesso!');
      navigate('/app/produtor');
    } catch (err: any) {
      console.error('Erro ao cadastrar:', err);
      setError(err.message || 'Erro ao realizar cadastro. Verifique os dados.');
      toastError(err.message || 'Falha ao cadastrar conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl text-center space-y-3 mb-6">
        <div className="inline-flex items-center gap-2 bg-[#1B7547]/10 text-[#1B7547] px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider shadow-2xs">
          <ShieldCheck className="w-4 h-4 text-[#C59B27]" />
          <span>Programa MS Sustentável — Aprosoja MS</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Criar Conta de Produtor Rural
        </h1>
        <p className="text-sm font-medium text-slate-600 max-w-lg mx-auto">
          Cadastre seu perfil, informe seu WhatsApp e localize sua fazenda via CAR, SIGEF, KML ou no **Mapa Pop-up de Sede**.
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-8 px-6 sm:px-10 rounded-3xl border border-slate-200/80 shadow-xl space-y-6">
          <form className="space-y-6" onSubmit={handleRegister}>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-bold text-center animate-shake">
                {error}
              </div>
            )}

            {/* SEÇÃO 1: DADOS PESSOAIS DO PRODUTOR */}
            <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                <User className="w-4 h-4 text-[#1B7547]" />
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  1. Dados do Produtor Rural
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                    Nome Completo *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="Ex: João da Silva Santos"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                      E-mail *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        placeholder="produtor@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                      Telefone / WhatsApp *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        required
                        placeholder="(67) 99999-9999"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                      Senha de Acesso *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        placeholder="Mínimo 8 caracteres"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        placeholder="Repita a senha"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SEÇÃO 2: DADOS DA FAZENDA & SOJA */}
            <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200/80 space-y-4">
              <div className="flex items-center gap-2 border-b border-emerald-200/80 pb-2">
                <Building2 className="w-4 h-4 text-[#1B7547]" />
                <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wider">
                  2. Identificação da Fazenda & Área de Soja
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase mb-1">
                    Área Plantada de Soja da Fazenda (em Hectares - ha)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Ex: 1250 (hectares de soja)"
                    value={areaSojaHa}
                    onChange={(e) => setAreaSojaHa(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#1B7547] focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-extrabold text-slate-700 uppercase">
                    Identificar Imóvel Rural (CAR, SIGEF, KML ou Mapa Pop-up da Sede)
                  </label>
                  <PropertyCodeInput
                    onChange={(data) => setPropertyData(data)}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-[#1B7547] via-[#16633b] to-[#0f4d2c] hover:from-[#16633b] hover:to-[#0f4d2c] text-white font-extrabold text-sm rounded-2xl shadow-lg shadow-[#1B7547]/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 text-[#C59B27]" />
                  <span>Cadastrar e Acessar Portal do Produtor</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center">
            <Link to="/login" className="text-xs font-extrabold text-[#1B7547] hover:underline inline-flex items-center gap-1">
              <span>Já possui conta cadastrada? Faça login no portal</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
