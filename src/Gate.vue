<script setup>
import { ref } from 'vue'

// mode: 'login' or 'setup' (first account) for directors, 'join' for camera operators
const props = defineProps({ mode: String, cam: Number, denied: Boolean })
const emit = defineEmits(['in'])
const email = ref(''), password = ref(''), code = ref(''), error = ref(props.denied ? 'That join code is not valid. Ask the director for the current one.' : ''), busy = ref(false)

async function submit() {
  error.value = ''
  // joining just puts the code in the link; App reloads on hash changes and connects with it
  if (props.mode === 'join') return (location.hash = `cam=${props.cam}&code=${encodeURIComponent(code.value.trim().toUpperCase())}`)
  busy.value = true
  try {
    const r = await fetch(props.mode === 'setup' ? '/api/signup' : '/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value, password: password.value }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error)
    emit('in', j)
  } catch (e) { error.value = e.message }
  busy.value = false
}
</script>

<template>
  <form class="gate" @submit.prevent="submit">
    <h1>{{ mode === 'join' ? `Join as camera ${cam}` : mode === 'setup' ? 'Create the director account' : 'Director login' }}</h1>
    <p v-if="mode === 'setup'">This is the first account on this server. More accounts are added with <code>npm run user add &lt;email&gt;</code>.</p>
    <template v-if="mode === 'join'">
      <input v-model="code" placeholder="Join code" aria-label="Join code" autocomplete="off" autocapitalize="characters" required autofocus />
    </template>
    <template v-else>
      <input v-model="email" type="email" placeholder="Email" aria-label="Email" autocomplete="username" required autofocus />
      <input v-model="password" type="password" placeholder="Password" aria-label="Password" :minlength="mode === 'setup' ? 8 : null"
        :autocomplete="mode === 'setup' ? 'new-password' : 'current-password'" required />
    </template>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button :disabled="busy">{{ mode === 'join' ? 'Join' : mode === 'setup' ? 'Create account' : 'Log in' }}</button>
  </form>
</template>

<style scoped>
.gate { margin: auto; width: min(340px, calc(100% - 32px)); display: flex; flex-direction: column; gap: 10px; padding: 24px; background: var(--bg2); border-radius: var(--r-lg); box-shadow: var(--float); }
h1 { margin: 0 0 4px; font-size: 20px; }
p { margin: 0; color: var(--dim); font-size: 13px; }
input { padding: 9px 12px; }
button { margin-top: 4px; padding: 9px; font-weight: 500; background: var(--primary); color: var(--primary-fg); }
.error { color: var(--red); }
</style>
