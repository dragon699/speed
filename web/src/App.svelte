<script lang="ts">
  import Car from './pages/Car.svelte'
  import Phone from './pages/Phone.svelte'
  import Lab from './pages/Lab.svelte'

  const page = location.pathname.replace(/\/+$/, '')
</script>

{#if page === '/car'}
  <Car />
{:else if page === '/phone'}
  <Phone />
{:else if page === '/lab'}
  <Lab />
{:else}
  <main class="page home">
    <h1>Speed</h1>
    <a class="button primary" href="/car">Car</a>
    <a class="button" href="/phone">Phone</a>
  </main>
{/if}

<style>
  .home {
    max-width: 420px;
    min-height: 100vh;
    justify-content: center;
  }

  h1 {
    margin: 0 0 12px;
    text-align: center;
  }
</style>
