<script>
    export let href = "";
    export let title = "";
  </script>
  
<a {href} {title} target="_blank" >
  <slot></slot>
</a>